import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons, pnrRecords } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProvider } from '@/lib/provider-factory';
import type { ExchangeResult, ExchangeParams } from '@/lib/providers/types';

// POST /api/tickets/:id/exchange
//
// Two-phase exchange — two failure points, mitigated by:
//   1. Storing Phase 2 result (ExchangeResult) in pendingOperationPayload before Phase 3
//   2. Reconcile cron reads stored payload to replay Phase 3 without a second provider call
//
// Failure at Phase 2: old ticket rolled back to 'active', no new ticket created
// Failure at Phase 3: old stays 'pending_exchange' + pendingOperationPayload set
//                     → reconcile cron uses stored payload to complete exchange
//
// Exchange creates:
//   - Old ticket → status='exchanged', coupons='void'
//   - New ticket → status='active', new ticketNumber, new coupons='open'
//
// Target PNR: body.newPnrId (if exchange changes itinerary) else original pnrId
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
      newPnrId?:     string;
      fareHalalas?:  number;
      taxHalalas?:   number;
      totalHalalas?: number;
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
        { error: `لا يمكن تبديل تذكرة بحالة: ${ticket.status}` },
        { status: 422 },
      );
    }
    if (!ticket.ticketNumber) {
      return NextResponse.json(
        { error: 'التذكرة لا تحتوي على رقم — انتظر اكتمال الإصدار أولاً' },
        { status: 422 },
      );
    }

    // Validate target PNR if provided
    if (body.newPnrId && body.newPnrId !== ticket.pnrId) {
      const [targetPnr] = await db
        .select({ id: pnrRecords.id, status: pnrRecords.status })
        .from(pnrRecords)
        .where(and(
          eq(pnrRecords.id, body.newPnrId),
          eq(pnrRecords.agencyId, agencyId),
          isNull(pnrRecords.deletedAt),
        ));
      if (!targetPnr) {
        return NextResponse.json({ error: 'PNR الجديد غير موجود' }, { status: 404 });
      }
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
    // provider call — mirrors refund/void. The conditional UPDATE + row lock
    // guarantees that two concurrent exchange requests cannot both pass — the
    // loser matches 0 rows and aborts, so the provider is never called twice
    // (which would issue two new tickets for the same exchange).
    const claim = await db.update(tickets)
      .set({ status: 'pending_exchange', updatedAt: new Date() })
      .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId), eq(tickets.status, 'active')))
      .returning({ id: tickets.id });
    if (claim.length === 0) {
      return NextResponse.json({ error: 'التذكرة قيد المعالجة أو لم تعد نشطة' }, { status: 409 });
    }

    // Phase 2: call provider
    const t0 = Date.now();
    let exchangeResult: ExchangeResult;
    try {
      exchangeResult = await provider.exchangeTicket(
        ticket.ticketNumber,
        credentials,
        {
          newPnrId:     body.newPnrId,
          fareHalalas:  body.fareHalalas,
          taxHalalas:   body.taxHalalas,
          totalHalalas: body.totalHalalas,
        } as ExchangeParams,
      );
    } catch (providerErr) {
      // Provider failed — roll back to active (exchange didn't happen)
      await db.update(tickets)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(tickets.id, params.id));

      const errorMsg = (providerErr as Error).message;
      logProviderSync({ agencyId, provider: providerCode, operation: 'exchange_ticket', status: 'failed', referenceId: params.id, errorMessage: errorMsg, durationMs: Date.now() - t0 });
      void logTravelEvent({ agencyId, eventType: 'ticket_exchange_failed', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { error: errorMsg, ticketNumber: ticket.ticketNumber } });

      return NextResponse.json({ error: `فشل التبديل عند المزود: ${errorMsg}` }, { status: 502 });
    }
    const durationMs = Date.now() - t0;

    // Store Phase 2 result BEFORE Phase 3
    // If Phase 3 fails, the reconcile cron reads this payload to replay Phase 3
    // without a second provider call — critical for exchange integrity
    await db.update(tickets)
      .set({
        pendingOperationPayload: exchangeResult as never,
        updatedAt:               new Date(),
      })
      .where(eq(tickets.id, params.id));

    // Phase 3: atomic commit — two-ticket operation
    const newTicketId  = crypto.randomUUID();
    const targetPnrId  = exchangeResult.newPnrId ?? body.newPnrId ?? ticket.pnrId;

    const [targetPnr] = await db
      .select()
      .from(pnrRecords)
      .where(eq(pnrRecords.id, targetPnrId));

    await db.transaction(async (tx) => {
      // Mark old ticket as exchanged
      await tx.update(tickets).set({
        status:                  'exchanged',
        pendingOperationPayload: null,
        updatedAt:               new Date(),
      }).where(eq(tickets.id, params.id));

      // Old coupons → void
      await tx.update(ticketCoupons)
        .set({ couponStatus: 'void', updatedAt: new Date() })
        .where(eq(ticketCoupons.ticketId, params.id));

      // Create new ticket
      await tx.insert(tickets).values({
        id:              newTicketId,
        agencyId,
        pnrId:           targetPnrId,
        bookingId:       ticket.bookingId,
        customerId:      ticket.customerId,
        credentialId:    ticket.credentialId,
        issuingProvider: providerCode,
        ticketNumber:    exchangeResult.newTicketNumber,
        passengerName:   ticket.passengerName,
        status:          'active',
        issuedAt:        new Date(),
        fareHalalas:     exchangeResult.newFareHalalas  ?? body.fareHalalas  ?? ticket.fareHalalas,
        taxHalalas:      exchangeResult.newTaxHalalas   ?? body.taxHalalas   ?? ticket.taxHalalas,
        totalHalalas:    exchangeResult.newTotalHalalas ?? body.totalHalalas ?? ticket.totalHalalas,
        issuedBy:        uid,
      });

      // New coupons
      if (targetPnr?.segments && targetPnr.segments.length > 0) {
        await tx.insert(ticketCoupons).values(
          targetPnr.segments.map((_, idx) => ({
            id:           crypto.randomUUID(),
            ticketId:     newTicketId,
            segmentIndex: idx,
            couponStatus: (exchangeResult.couponStatuses[idx] ?? 'open') as 'open' | 'used' | 'void' | 'refunded',
          })),
        );
      }
    });

    logProviderSync({ agencyId, provider: providerCode, operation: 'exchange_ticket', status: 'success', referenceId: params.id, durationMs });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'ticket', resourceId: params.id, before: { status: 'active', ticketNumber: ticket.ticketNumber }, after: { status: 'exchanged', newTicketId, newTicketNumber: exchangeResult.newTicketNumber } });
    void logTravelEvent({ agencyId, eventType: 'ticket_exchanged', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { oldTicketNumber: ticket.ticketNumber, newTicketNumber: exchangeResult.newTicketNumber, newTicketId, targetPnrId } });

    return NextResponse.json({
      success:         true,
      newTicketId,
      newTicketNumber: exchangeResult.newTicketNumber,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'ticket_exchange_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
