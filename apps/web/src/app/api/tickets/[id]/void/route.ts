import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProvider } from '@/lib/provider-factory';

// POST /api/tickets/:id/void
//
// Two-phase void:
//   Phase 1: UPDATE ticket { status='pending_void' }   ← committed before provider call
//   Phase 2: provider.voidTicket(ticketNumber)         ← external call
//   Phase 3: TRANSACTION { status='void', coupons='void' }
//
// If Phase 3 fails after Phase 2:
//   ticket stays 'pending_void' → reconcile cron calls retrievePNR to verify
//   and completes void if provider confirms (or resets to 'active' if not)
//
// If Phase 2 fails (provider rejected):
//   ticket rolled back to 'active' — user can retry
//
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as { credentialId?: string };

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId)));

    if (!ticket) {
      return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404 });
    }
    if (ticket.status !== 'active') {
      return NextResponse.json(
        { error: `لا يمكن إلغاء تذكرة بحالة: ${ticket.status}` },
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
    // provider call. The conditional UPDATE + row lock guarantees that two
    // concurrent void requests cannot both pass — the loser matches 0 rows and
    // aborts, so the provider is never called twice for one ticket.
    const claim = await db.update(tickets)
      .set({ status: 'pending_void', updatedAt: new Date() })
      .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId), eq(tickets.status, 'active')))
      .returning({ id: tickets.id });
    if (claim.length === 0) {
      return NextResponse.json({ error: 'التذكرة قيد المعالجة أو لم تعد نشطة' }, { status: 409 });
    }

    // Phase 2: call provider
    const t0 = Date.now();
    try {
      await provider.voidTicket(ticket.ticketNumber, credentials);
    } catch (providerErr) {
      // Provider rejected — roll back to active; user must retry
      await db.update(tickets)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(tickets.id, params.id));

      const errorMsg = (providerErr as Error).message;
      logProviderSync({ agencyId, provider: providerCode, operation: 'void_ticket', status: 'failed', referenceId: params.id, errorMessage: errorMsg, durationMs: Date.now() - t0 });
      void logTravelEvent({ agencyId, eventType: 'ticket_void_failed', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { error: errorMsg, ticketNumber: ticket.ticketNumber } });

      return NextResponse.json({ error: `فشل الإلغاء عند المزود: ${errorMsg}` }, { status: 502 });
    }
    const durationMs = Date.now() - t0;

    // Phase 3: atomic local commit
    // If this fails → ticket stays 'pending_void' → reconcile cron heals it
    await db.transaction(async (tx) => {
      await tx.update(tickets).set({
        status:    'void',
        voidedAt:  new Date(),
        voidedBy:  uid,
        updatedAt: new Date(),
      }).where(eq(tickets.id, params.id));

      await tx.update(ticketCoupons)
        .set({ couponStatus: 'void', updatedAt: new Date() })
        .where(eq(ticketCoupons.ticketId, params.id));
    });

    logProviderSync({ agencyId, provider: providerCode, operation: 'void_ticket', status: 'success', referenceId: params.id, durationMs });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'ticket', resourceId: params.id, before: { status: 'active', ticketNumber: ticket.ticketNumber }, after: { status: 'void' } });
    void logTravelEvent({ agencyId, eventType: 'ticket_voided', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { ticketNumber: ticket.ticketNumber } });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'ticket_void_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
