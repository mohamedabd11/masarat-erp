import { NextResponse } from 'next/server';
import { eq, and, lt, or, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons, pnrRecords } from '@/lib/schema';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProviderByCode } from '@/lib/provider-factory';
import type { ExchangeResult } from '@/lib/providers/types';

// Invoked by Vercel Cron: "30 * * * *" (offset 30 min from expire-pnrs at :00)
// Authorization: Bearer ${CRON_SECRET}
// If CRON_SECRET is unset → runs unprotected (local dev only)
//
// Heals all pending_* tickets where Phase 3 (local transaction) failed
// after the provider call (Phase 2) already succeeded.
//
// Dispatch map:
//   pending          → recoverIssuance   (call retrievePNR to get ticketNumber)
//   pending_void     → recoverVoid       (call retrievePNR to verify void)
//   pending_refund   → recoverRefund     (call retrievePNR to verify refund)
//   pending_exchange → recoverExchange   (use stored payload OR call retrievePNR)
//
// Orphan policy (attempts >= 20):
//   pending          → void        (assume issuance didn't happen)
//   pending_void     → void        (provider void likely succeeded)
//   pending_refund   → active      (preserve ticket, admin must verify)
//   pending_exchange → active      (preserve ticket, admin must verify)

const RECOVERABLE = ['pending', 'pending_void', 'pending_refund', 'pending_exchange'] as const;
const MAX_ATTEMPTS = 20;

export async function GET(request: Request) {
  const secret = process.env['CRON_SECRET'];
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now                = new Date();
  const graceWindowMs      = 10 * 60 * 1000;   // 10 min — Phase 3 may still be in-flight
  const recentAttemptMs    = 5  * 60 * 1000;   // 5 min  — overlap protection between two cron runs
  const graceDeadline      = new Date(now.getTime() - graceWindowMs);
  const recentAttemptCutoff = new Date(now.getTime() - recentAttemptMs);

  // Only process tickets:
  //   1. Older than the grace window (Phase 3 had time to commit on its own)
  //   2. Not attempted in the last 5 min (prevents double-processing if crons overlap)
  const batch = await db
    .select()
    .from(tickets)
    .where(and(
      inArray(tickets.status, [...RECOVERABLE]),
      lt(tickets.createdAt, graceDeadline),
      or(
        isNull(tickets.lastReconciliationAt),
        lt(tickets.lastReconciliationAt, recentAttemptCutoff),
      ),
    ))
    .limit(50);

  if (batch.length === 0) {
    return NextResponse.json({ reconciled: 0, voided: 0, reset: 0 });
  }

  let reconciled = 0;
  let voided     = 0;
  let reset      = 0;

  for (const ticket of batch) {
    try {
      // Atomically increment attempts + stamp lastReconciliationAt
      const [updated] = await db
        .update(tickets)
        .set({
          reconciliationAttempts: sql`${tickets.reconciliationAttempts} + 1`,
          lastReconciliationAt:   now,
          updatedAt:              now,
        })
        .where(eq(tickets.id, ticket.id))
        .returning({ attempts: tickets.reconciliationAttempts });

      const newAttempts = updated?.attempts ?? MAX_ATTEMPTS;

      // ── Orphan handling ────────────────────────────────────────────────────
      if (newAttempts >= MAX_ATTEMPTS) {
        await handleOrphan(ticket, now);
        if (ticket.status === 'pending' || ticket.status === 'pending_void') {
          voided++;
        } else {
          reset++;
        }
        continue;
      }

      // ── Skip if provider is unknown ────────────────────────────────────────
      if (!ticket.issuingProvider) continue;

      // ── Fetch PNR ──────────────────────────────────────────────────────────
      const [pnr] = await db
        .select()
        .from(pnrRecords)
        .where(eq(pnrRecords.id, ticket.pnrId));
      if (!pnr) continue;

      // ── Resolve provider ───────────────────────────────────────────────────
      let provider, credentials, providerCode: string;
      try {
        ({ provider, credentials, providerCode } = await resolveFlightProviderByCode(
          ticket.issuingProvider,
          ticket.agencyId,
        ));
      } catch {
        // Credential may have been deactivated — skip, will hit orphan threshold
        continue;
      }

      // ── Dispatch ───────────────────────────────────────────────────────────
      const t0 = Date.now();
      let healed = false;

      switch (ticket.status) {
        case 'pending':
          healed = await recoverIssuance(ticket, pnr, provider, credentials, providerCode, now);
          break;
        case 'pending_void':
          healed = await recoverVoid(ticket, pnr, provider, credentials, providerCode, now);
          break;
        case 'pending_refund':
          healed = await recoverRefund(ticket, pnr, provider, credentials, providerCode, now);
          break;
        case 'pending_exchange':
          healed = await recoverExchange(ticket, pnr, provider, credentials, providerCode, now);
          break;
      }

      const durationMs = Date.now() - t0;

      if (healed) {
        logProviderSync({ agencyId: ticket.agencyId, provider: providerCode, operation: `reconcile_${ticket.status}`, status: 'success', referenceId: ticket.id, durationMs });
        reconciled++;
      } else {
        logProviderSync({ agencyId: ticket.agencyId, provider: providerCode, operation: `reconcile_${ticket.status}`, status: 'failed', referenceId: ticket.id, errorMessage: 'provider state not yet deterministic', durationMs });
      }
    } catch (err) {
      // Single ticket failure must never abort the batch
      console.error(JSON.stringify({ event: 'reconcile_batch_error', ticketId: ticket.id, error: String(err) }));
    }
  }

  return NextResponse.json({ reconciled, voided, reset });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function recoverIssuance(
  ticket: typeof tickets.$inferSelect,
  pnr:    typeof pnrRecords.$inferSelect,
  provider: Awaited<ReturnType<typeof resolveFlightProviderByCode>>['provider'],
  credentials: unknown,
  providerCode: string,
  now: Date,
): Promise<boolean> {
  const pnrData = await provider.retrievePNR(pnr.pnrCode, credentials);

  const match = pnrData.passengers.find(
    (p) => p.name.toUpperCase() === ticket.passengerName.toUpperCase(),
  );
  if (!match?.ticketNumber) return false;   // not yet issued at provider

  await db.transaction(async (tx) => {
    await tx.update(tickets).set({
      status:       'active',
      ticketNumber: match.ticketNumber!,
      issuedAt:     now,
      updatedAt:    now,
    }).where(eq(tickets.id, ticket.id));

    const existing = await tx
      .select({ id: ticketCoupons.id })
      .from(ticketCoupons)
      .where(eq(ticketCoupons.ticketId, ticket.id));

    if (existing.length === 0 && pnrData.segments.length > 0) {
      await tx.insert(ticketCoupons).values(
        pnrData.segments.map((_, idx) => ({
          id:           crypto.randomUUID(),
          ticketId:     ticket.id,
          segmentIndex: idx,
          couponStatus: 'open' as const,
        })),
      );
    }

    if (pnr.status !== 'ticketed') {
      await tx.update(pnrRecords).set({ status: 'ticketed', updatedAt: now })
        .where(eq(pnrRecords.id, ticket.pnrId));
    }
  });

  void logTravelEvent({ agencyId: ticket.agencyId, eventType: 'ticket_reconciled', provider: providerCode, resourceId: ticket.id, resourceType: 'ticket', actorId: 'system', payload: { op: 'issuance', ticketNumber: match.ticketNumber, pnrCode: pnr.pnrCode } });
  return true;
}

async function recoverVoid(
  ticket: typeof tickets.$inferSelect,
  pnr:    typeof pnrRecords.$inferSelect,
  provider: Awaited<ReturnType<typeof resolveFlightProviderByCode>>['provider'],
  credentials: unknown,
  providerCode: string,
  now: Date,
): Promise<boolean> {
  const pnrData = await provider.retrievePNR(pnr.pnrCode, credentials);

  // If ticket number is NOT in any passenger's ticketNumber → provider voided it
  const stillActive = pnrData.passengers.some(
    (p) => p.ticketNumber === ticket.ticketNumber,
  );

  if (stillActive) {
    // Provider still shows it as active — void may not have gone through
    // Reset to active so the user can retry
    await db.update(tickets).set({ status: 'active', updatedAt: now })
      .where(eq(tickets.id, ticket.id));
    void logTravelEvent({ agencyId: ticket.agencyId, eventType: 'ticket_reconciled', provider: providerCode, resourceId: ticket.id, resourceType: 'ticket', actorId: 'system', payload: { op: 'void_reset_to_active', reason: 'ticket_still_at_provider' } });
    return true;
  }

  // Provider confirms void — complete locally
  await db.transaction(async (tx) => {
    await tx.update(tickets).set({
      status:    'void',
      voidedAt:  now,
      voidedBy:  'system',
      updatedAt: now,
    }).where(eq(tickets.id, ticket.id));

    await tx.update(ticketCoupons)
      .set({ couponStatus: 'void', updatedAt: now })
      .where(eq(ticketCoupons.ticketId, ticket.id));
  });

  void logTravelEvent({ agencyId: ticket.agencyId, eventType: 'ticket_reconciled', provider: providerCode, resourceId: ticket.id, resourceType: 'ticket', actorId: 'system', payload: { op: 'void', ticketNumber: ticket.ticketNumber } });
  return true;
}

async function recoverRefund(
  ticket: typeof tickets.$inferSelect,
  pnr:    typeof pnrRecords.$inferSelect,
  provider: Awaited<ReturnType<typeof resolveFlightProviderByCode>>['provider'],
  credentials: unknown,
  providerCode: string,
  now: Date,
): Promise<boolean> {
  const pnrData = await provider.retrievePNR(pnr.pnrCode, credentials);

  // If ticketNumber is gone from PNR → assume refund completed at provider
  const stillPresent = pnrData.passengers.some(
    (p) => p.ticketNumber === ticket.ticketNumber,
  );

  if (stillPresent) return false;   // not yet refunded at provider

  await db.transaction(async (tx) => {
    await tx.update(tickets).set({
      status:     'refunded',
      refundedAt: now,
      updatedAt:  now,
    }).where(eq(tickets.id, ticket.id));

    await tx.update(ticketCoupons)
      .set({ couponStatus: 'refunded', updatedAt: now })
      .where(eq(ticketCoupons.ticketId, ticket.id));
  });

  void logTravelEvent({ agencyId: ticket.agencyId, eventType: 'ticket_reconciled', provider: providerCode, resourceId: ticket.id, resourceType: 'ticket', actorId: 'system', payload: { op: 'refund', ticketNumber: ticket.ticketNumber } });
  return true;
}

async function recoverExchange(
  ticket: typeof tickets.$inferSelect,
  pnr:    typeof pnrRecords.$inferSelect,
  provider: Awaited<ReturnType<typeof resolveFlightProviderByCode>>['provider'],
  credentials: unknown,
  providerCode: string,
  now: Date,
): Promise<boolean> {
  // Fast path: Phase 2 stored the exchange result — replay Phase 3 without provider call
  const payload = ticket.pendingOperationPayload as ExchangeResult | null;

  if (payload?.newTicketNumber) {
    await completeExchange(ticket, payload, pnr, now);
    void logTravelEvent({ agencyId: ticket.agencyId, eventType: 'ticket_reconciled', provider: providerCode, resourceId: ticket.id, resourceType: 'ticket', actorId: 'system', payload: { op: 'exchange_from_payload', newTicketNumber: payload.newTicketNumber } });
    return true;
  }

  // Slow path: no stored payload — call provider to discover new ticket
  const pnrData = await provider.retrievePNR(pnr.pnrCode, credentials);

  const oldGone = !pnrData.passengers.some(
    (p) => p.ticketNumber === ticket.ticketNumber,
  );
  if (!oldGone) return false;   // exchange not yet completed at provider

  // Find the new ticket (any ticketNumber that isn't the old one)
  const newPassenger = pnrData.passengers.find(
    (p) => p.ticketNumber && p.ticketNumber !== ticket.ticketNumber,
  );
  if (!newPassenger?.ticketNumber) return false;

  const inferredPayload: ExchangeResult = {
    newTicketNumber: newPassenger.ticketNumber,
    couponStatuses:  pnrData.segments.map(() => 'open' as const),
  };

  await completeExchange(ticket, inferredPayload, pnr, now);
  void logTravelEvent({ agencyId: ticket.agencyId, eventType: 'ticket_reconciled', provider: providerCode, resourceId: ticket.id, resourceType: 'ticket', actorId: 'system', payload: { op: 'exchange_from_pnr', newTicketNumber: newPassenger.ticketNumber } });
  return true;
}

async function completeExchange(
  oldTicket: typeof tickets.$inferSelect,
  payload:   ExchangeResult,
  pnr:       typeof pnrRecords.$inferSelect,
  now:       Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Mark old ticket exchanged
    await tx.update(tickets).set({
      status:    'exchanged',
      updatedAt: now,
    }).where(eq(tickets.id, oldTicket.id));

    // Old coupons → void
    await tx.update(ticketCoupons)
      .set({ couponStatus: 'void', updatedAt: now })
      .where(eq(ticketCoupons.ticketId, oldTicket.id));

    // Create new ticket
    const newId = crypto.randomUUID();
    const targetPnrId = payload.newPnrId ?? oldTicket.pnrId;

    await tx.insert(tickets).values({
      id:              newId,
      agencyId:        oldTicket.agencyId,
      pnrId:           targetPnrId,
      bookingId:       oldTicket.bookingId,
      customerId:      oldTicket.customerId,
      credentialId:    oldTicket.credentialId,
      issuingProvider: oldTicket.issuingProvider,
      ticketNumber:    payload.newTicketNumber,
      passengerName:   oldTicket.passengerName,
      status:          'active',
      issuedAt:        now,
      fareHalalas:     payload.newFareHalalas   ?? oldTicket.fareHalalas,
      taxHalalas:      payload.newTaxHalalas    ?? oldTicket.taxHalalas,
      totalHalalas:    payload.newTotalHalalas  ?? oldTicket.totalHalalas,
      issuedBy:        'system',
    });

    // Coupons for new ticket
    if (pnr.segments && pnr.segments.length > 0) {
      await tx.insert(ticketCoupons).values(
        pnr.segments.map((_, idx) => ({
          id:           crypto.randomUUID(),
          ticketId:     newId,
          segmentIndex: idx,
          couponStatus: (payload.couponStatuses[idx] ?? 'open') as 'open' | 'used' | 'void' | 'refunded',
        })),
      );
    }
  });
}

async function handleOrphan(
  ticket: typeof tickets.$inferSelect,
  now:    Date,
): Promise<void> {
  let finalStatus: string;
  let eventPayloadReason: string;

  switch (ticket.status) {
    case 'pending':
      // Assume not issued — void is the safe choice
      finalStatus       = 'void';
      eventPayloadReason = 'orphan_issuance';
      break;
    case 'pending_void':
      // Void likely succeeded at provider — complete locally
      finalStatus       = 'void';
      eventPayloadReason = 'orphan_void';
      break;
    case 'pending_refund':
      // Cannot confirm refund — reset to active so admin can verify
      finalStatus       = 'active';
      eventPayloadReason = 'orphan_refund_reset_to_active';
      break;
    case 'pending_exchange':
      // Cannot confirm exchange — reset to active so admin can verify
      finalStatus       = 'active';
      eventPayloadReason = 'orphan_exchange_reset_to_active';
      break;
    default:
      return;
  }

  await db.update(tickets).set({ status: finalStatus, updatedAt: now })
    .where(eq(tickets.id, ticket.id));

  void logTravelEvent({
    agencyId:     ticket.agencyId,
    eventType:    'ticket_reconcile_failed',
    provider:     ticket.issuingProvider ?? undefined,
    resourceId:   ticket.id,
    resourceType: 'ticket',
    actorId:      'system',
    payload:      {
      reason:       eventPayloadReason,
      finalStatus,
      attempts:     MAX_ATTEMPTS,
      pnrId:        ticket.pnrId,
      passengerName: ticket.passengerName,
    },
  });
}
