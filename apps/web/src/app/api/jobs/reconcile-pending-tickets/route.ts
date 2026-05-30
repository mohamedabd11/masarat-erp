import { NextResponse } from 'next/server';
import { eq, and, lt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons, pnrRecords } from '@/lib/schema';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProviderByCode } from '@/lib/provider-factory';

// Invoked by Vercel Cron: "30 * * * *" (30 min offset from expire-pnrs)
// Authorization: Bearer ${CRON_SECRET}
// If CRON_SECRET is unset → runs unprotected (local dev only)
//
// Heals 'pending' tickets where Phase 3 (local transaction) failed after
// provider.issueTicket() already succeeded. Calls provider.retrievePNR() to
// recover ticket numbers and complete the write.
//
// Orphan threshold: 24h — after that the ticket is voided (provider likely
// rolled back or the issuance never happened).
export async function GET(request: Request) {
  const secret = process.env['CRON_SECRET'];
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now             = new Date();
  const graceWindowMs   = 10 * 60 * 1000;        // 10 min — provider call could still be in-flight
  const orphanThreshold = 24 * 60 * 60 * 1000;   // 24 h — give up and void
  const graceDeadline   = new Date(now.getTime() - graceWindowMs);
  const orphanDeadline  = new Date(now.getTime() - orphanThreshold);

  // Only process tickets older than the grace window (Phase 3 has had time to complete)
  const pendingTickets = await db
    .select()
    .from(tickets)
    .where(and(
      eq(tickets.status, 'pending'),
      lt(tickets.createdAt, graceDeadline),
    ))
    .limit(50);

  if (pendingTickets.length === 0) {
    return NextResponse.json({ reconciled: 0, voided: 0 });
  }

  let reconciled = 0;
  let voided     = 0;

  for (const ticket of pendingTickets) {
    // Orphan: past 24h threshold — void without calling provider
    if (ticket.createdAt < orphanDeadline) {
      await db.update(tickets)
        .set({ status: 'void', updatedAt: now })
        .where(eq(tickets.id, ticket.id));

      void logTravelEvent({
        agencyId:     ticket.agencyId,
        eventType:    'ticket_reconcile_failed',
        provider:     ticket.issuingProvider ?? undefined,
        resourceId:   ticket.id,
        resourceType: 'ticket',
        actorId:      'system',
        payload:      { reason: 'orphan_24h', pnrId: ticket.pnrId, passengerName: ticket.passengerName },
      });
      voided++;
      continue;
    }

    // Within 24h: try to recover via retrievePNR
    if (!ticket.issuingProvider) {
      // Cannot recover without knowing the provider — skip (will hit orphan threshold later)
      continue;
    }

    try {
      const [pnr] = await db
        .select()
        .from(pnrRecords)
        .where(eq(pnrRecords.id, ticket.pnrId));

      if (!pnr) continue;

      const { provider, credentials, providerCode } = await resolveFlightProviderByCode(
        ticket.issuingProvider,
        ticket.agencyId,
      );

      const t0      = Date.now();
      const pnrData = await provider.retrievePNR(pnr.pnrCode, credentials);
      const durationMs = Date.now() - t0;

      // Find the ticket number for this passenger in the PNR data
      const matchedPassenger = pnrData.passengers.find(
        (p) => p.name.toUpperCase() === ticket.passengerName.toUpperCase(),
      );

      if (!matchedPassenger?.ticketNumber) {
        // Provider doesn't have a ticket for this passenger — not issued yet
        logProviderSync({ agencyId: ticket.agencyId, provider: providerCode, operation: 'reconcile_ticket', status: 'failed', referenceId: ticket.id, errorMessage: 'no ticket number in provider PNR', durationMs });
        continue;
      }

      // Complete Phase 3
      await db.transaction(async (tx) => {
        await tx.update(tickets).set({
          status:       'active',
          ticketNumber: matchedPassenger.ticketNumber!,
          issuedAt:     new Date(),
          updatedAt:    now,
        }).where(eq(tickets.id, ticket.id));

        // Create coupons if not already present
        const existingCoupons = await tx
          .select({ id: ticketCoupons.id })
          .from(ticketCoupons)
          .where(eq(ticketCoupons.ticketId, ticket.id));

        if (existingCoupons.length === 0 && pnrData.segments.length > 0) {
          await tx.insert(ticketCoupons).values(
            pnrData.segments.map((_, idx) => ({
              id:           crypto.randomUUID(),
              ticketId:     ticket.id,
              segmentIndex: idx,
              couponStatus: 'open' as const,
            })),
          );
        }

        // Mark PNR as ticketed if not already
        if (pnr.status !== 'ticketed') {
          await tx.update(pnrRecords)
            .set({ status: 'ticketed', updatedAt: now })
            .where(eq(pnrRecords.id, ticket.pnrId));
        }
      });

      logProviderSync({ agencyId: ticket.agencyId, provider: providerCode, operation: 'reconcile_ticket', status: 'success', referenceId: ticket.id, durationMs });
      void logTravelEvent({
        agencyId:     ticket.agencyId,
        eventType:    'ticket_reconciled',
        provider:     providerCode,
        resourceId:   ticket.id,
        resourceType: 'ticket',
        actorId:      'system',
        payload:      { ticketNumber: matchedPassenger.ticketNumber, pnrCode: pnr.pnrCode },
      });
      reconciled++;
    } catch (err) {
      // Log and continue — single failure must not abort the batch
      console.error(JSON.stringify({
        event:    'reconcile_ticket_error',
        ticketId: ticket.id,
        error:    String(err),
      }));
    }
  }

  return NextResponse.json({ reconciled, voided });
}
