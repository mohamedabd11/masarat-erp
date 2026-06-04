import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProvider } from '@/lib/provider-factory';
import type { RefundParams } from '@/lib/providers/types';

// POST /api/tickets/:id/refund
//
// Two-phase refund:
//   Phase 1: UPDATE ticket { status='pending_refund' }
//   Phase 2: provider.refundTicket(ticketNumber, params)
//   Phase 3: TRANSACTION { status='refunded', coupons='refunded' }
//
// If Phase 3 fails after Phase 2:
//   ticket stays 'pending_refund' → reconcile cron calls retrievePNR to verify
//   If provider confirms refund (ticketNumber gone) → complete locally
//   If provider still shows active → reset to 'active' (admin must verify)
//
// Financial note: refund creates a Refund Request + Payment Voucher in ERP (separate step)
//
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as {
      credentialId?: string;
      reason?:       RefundParams['reason'];
      notes?:        string;
    };

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId)));

    if (!ticket) {
      return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404 });
    }
    if (ticket.status !== 'active') {
      return NextResponse.json(
        { error: `لا يمكن استرداد تذكرة بحالة: ${ticket.status}` },
        { status: 422 },
      );
    }
    if (!ticket.ticketNumber) {
      return NextResponse.json(
        { error: 'التذكرة لا تحتوي على رقم — انتظر اكتمال الإصدار أولاً' },
        { status: 422 },
      );
    }

    const credentialId = body.credentialId ?? ticket.credentialId;
    if (!credentialId) {
      return NextResponse.json({ error: 'credentialId مطلوب' }, { status: 400 });
    }

    const { provider, credentials, providerCode } = await resolveFlightProvider(
      credentialId,
      agencyId,
    );

    // Phase 1: atomically CLAIM the ticket (only if still active) before any
    // provider call. The conditional UPDATE + row lock prevents two concurrent
    // refunds from both calling the provider — the loser matches 0 rows.
    const claim = await db.update(tickets)
      .set({ status: 'pending_refund', updatedAt: new Date() })
      .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId), eq(tickets.status, 'active')))
      .returning({ id: tickets.id });
    if (claim.length === 0) {
      return NextResponse.json({ error: 'التذكرة قيد المعالجة أو لم تعد نشطة' }, { status: 409 });
    }

    // Phase 2: provider refund
    const t0 = Date.now();
    let refundResult;
    try {
      refundResult = await provider.refundTicket(
        ticket.ticketNumber,
        credentials,
        { reason: body.reason, notes: body.notes },
      );
    } catch (providerErr) {
      // Roll back to active — refund not confirmed
      await db.update(tickets)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(tickets.id, params.id));

      const errorMsg = (providerErr as Error).message;
      logProviderSync({ agencyId, provider: providerCode, operation: 'refund_ticket', status: 'failed', referenceId: params.id, errorMessage: errorMsg, durationMs: Date.now() - t0 });
      void logTravelEvent({ agencyId, eventType: 'ticket_refund_failed', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { error: errorMsg, ticketNumber: ticket.ticketNumber } });

      return NextResponse.json({ error: `فشل الاسترداد عند المزود: ${errorMsg}` }, { status: 502 });
    }
    const durationMs = Date.now() - t0;

    // Phase 3: atomic local commit
    await db.transaction(async (tx) => {
      await tx.update(tickets).set({
        status:     'refunded',
        refundedAt: new Date(),
        updatedAt:  new Date(),
      }).where(eq(tickets.id, params.id));

      await tx.update(ticketCoupons)
        .set({ couponStatus: 'refunded', updatedAt: new Date() })
        .where(eq(ticketCoupons.ticketId, params.id));
    });

    logProviderSync({ agencyId, provider: providerCode, operation: 'refund_ticket', status: 'success', referenceId: params.id, durationMs });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'ticket', resourceId: params.id, before: { status: 'active', ticketNumber: ticket.ticketNumber }, after: { status: 'refunded', refundReference: refundResult?.refundReference } });
    void logTravelEvent({ agencyId, eventType: 'ticket_refunded', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { ticketNumber: ticket.ticketNumber, refundReference: refundResult?.refundReference, refundAmountHalalas: refundResult?.refundAmountHalalas, reason: body.reason } });

    return NextResponse.json({
      success:             true,
      refundReference:     refundResult?.refundReference,
      refundAmountHalalas: refundResult?.refundAmountHalalas,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'ticket_refund_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
