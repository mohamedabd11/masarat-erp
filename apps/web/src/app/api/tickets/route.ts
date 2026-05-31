import { NextResponse } from 'next/server';
import { eq, and, inArray, isNull, desc, getTableColumns } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons, pnrRecords } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProvider } from '@/lib/provider-factory';

// ─── GET /api/tickets ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const pnrId      = url.searchParams.get('pnrId')     ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;
    const status     = url.searchParams.get('status')    ?? undefined;

    const conditions = [eq(tickets.agencyId, agencyId)];
    if (pnrId)      conditions.push(eq(tickets.pnrId, pnrId));
    if (customerId) conditions.push(eq(tickets.customerId, customerId));
    if (status)     conditions.push(eq(tickets.status, status));

    const ticketCols = getTableColumns(tickets);
    const rows = await db
      .select({ ...ticketCols, pnrCode: pnrRecords.pnrCode })
      .from(tickets)
      .leftJoin(pnrRecords, eq(tickets.pnrId, pnrRecords.id))
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt))
      .limit(200);

    return NextResponse.json({ tickets: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ─── POST /api/tickets ─────────────────────────────────────────────────────────
//
// Two-phase write pattern (prevents orphaned provider tickets):
//
//   Phase 1 — local atomic INSERT { status:'pending', ticketNumber:NULL }
//             (committed before any external call)
//   Phase 2 — provider.issueTicket()   (external, may succeed even if Phase 3 fails)
//   Phase 3 — atomic transaction:
//               UPDATE ticket  { status:'active', ticketNumber, issuedAt }
//               INSERT ticket_coupons (one per segment)
//               UPDATE pnr     { status:'ticketed' }
//
// If Phase 3 fails after Phase 2 succeeds:
//   - The 'pending' ticket row acts as a tombstone
//   - GET /api/jobs/reconcile-pending-tickets heals it within 1 hour
//     by calling provider.retrievePNR() and completing Phase 3
//
export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      pnrId:          string;
      credentialId:   string;
      passengerName:  string;
      fareHalalas?:   number;
      taxHalalas?:    number;
      totalHalalas?:  number;
    };

    if (!body.pnrId?.trim() || !body.credentialId?.trim() || !body.passengerName?.trim()) {
      return NextResponse.json(
        { error: 'pnrId و credentialId و passengerName مطلوبة' },
        { status: 400 },
      );
    }

    // ── Fetch and validate PNR ───────────────────────────────────────────────
    const [pnr] = await db
      .select()
      .from(pnrRecords)
      .where(and(
        eq(pnrRecords.id, body.pnrId),
        eq(pnrRecords.agencyId, agencyId),
        isNull(pnrRecords.deletedAt),
      ));

    if (!pnr) {
      return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });
    }
    if (pnr.status === 'cancelled') {
      return NextResponse.json({ error: 'لا يمكن إصدار تذكرة لـ PNR ملغى' }, { status: 422 });
    }
    if (pnr.status === 'expired') {
      return NextResponse.json({ error: 'لا يمكن إصدار تذكرة لـ PNR منتهي الصلاحية' }, { status: 422 });
    }

    // ── Idempotency guard ────────────────────────────────────────────────────
    // Block duplicate issuance for the same passenger on the same PNR.
    // 'pending' is included to prevent double-calls during reconciliation window.
    const existing = await db
      .select({ id: tickets.id, status: tickets.status })
      .from(tickets)
      .where(and(
        eq(tickets.agencyId, agencyId),
        eq(tickets.pnrId, body.pnrId),
        eq(tickets.passengerName, body.passengerName),
        inArray(tickets.status, ['active', 'pending']),
      ))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error:    'تذكرة لهذا الراكب على هذا PNR موجودة بالفعل',
          ticketId: existing[0]!.id,
          status:   existing[0]!.status,
        },
        { status: 409 },
      );
    }

    // ── Resolve provider ─────────────────────────────────────────────────────
    const { provider, credentials, providerCode } = await resolveFlightProvider(
      body.credentialId,
      agencyId,
    );

    // ── Phase 1: local INSERT (before provider call) ─────────────────────────
    const ticketId = crypto.randomUUID();
    await db.insert(tickets).values({
      id:              ticketId,
      agencyId,
      pnrId:           body.pnrId,
      bookingId:       pnr.bookingId  ?? null,
      customerId:      pnr.customerId ?? null,
      credentialId:    body.credentialId,
      issuingProvider: providerCode,
      ticketNumber:    null,
      passengerName:   body.passengerName,
      status:          'pending',
      fareHalalas:     body.fareHalalas  ?? pnr.fareHalalas,
      taxHalalas:      body.taxHalalas   ?? pnr.taxHalalas,
      totalHalalas:    body.totalHalalas ?? pnr.totalHalalas,
      issuedBy:        uid,
    });

    // ── Phase 2: provider call ───────────────────────────────────────────────
    const t0 = Date.now();
    let issuanceResult;
    try {
      issuanceResult = await provider.issueTicket(pnr.pnrCode, credentials);
    } catch (providerErr) {
      // Provider failed — mark ticket void so it doesn't appear in reconciliation
      await db.update(tickets)
        .set({ status: 'void', updatedAt: new Date() })
        .where(eq(tickets.id, ticketId));

      const errorMsg = (providerErr as Error).message;
      logProviderSync({ agencyId, provider: providerCode, operation: 'issue_ticket', status: 'failed', referenceId: ticketId, errorMessage: errorMsg, durationMs: Date.now() - t0 });
      void logTravelEvent({ agencyId, eventType: 'ticket_issue_failed', provider: providerCode, resourceId: ticketId, resourceType: 'ticket', actorId: uid, payload: { error: errorMsg, pnrCode: pnr.pnrCode, passengerName: body.passengerName } });

      return NextResponse.json({ error: `فشل استدعاء مزود GDS: ${errorMsg}` }, { status: 502 });
    }
    const durationMs = Date.now() - t0;

    // Match the issued ticket to the requested passenger (case-insensitive)
    const issuedTicket =
      issuanceResult.tickets.find(
        (t) => t.passengerName.toUpperCase() === body.passengerName.toUpperCase(),
      ) ?? (issuanceResult.tickets.length === 1 ? issuanceResult.tickets[0] : undefined);

    if (!issuedTicket) {
      await db.update(tickets)
        .set({ status: 'void', updatedAt: new Date() })
        .where(eq(tickets.id, ticketId));

      logProviderSync({ agencyId, provider: providerCode, operation: 'issue_ticket', status: 'failed', referenceId: ticketId, errorMessage: `passenger not found in provider response: ${body.passengerName}`, durationMs });
      void logTravelEvent({ agencyId, eventType: 'ticket_issue_failed', provider: providerCode, resourceId: ticketId, resourceType: 'ticket', actorId: uid, payload: { reason: 'passenger_not_in_response', pnrCode: pnr.pnrCode } });

      return NextResponse.json(
        { error: 'لم يتم العثور على تذكرة للراكب في استجابة المزود' },
        { status: 502 },
      );
    }

    // ── Phase 3: atomic local commit ─────────────────────────────────────────
    // If this transaction fails after Phase 2 succeeded:
    //   - 'pending' ticket row remains (ticketNumber still NULL)
    //   - reconcile-pending-tickets cron will complete it within 1 hour
    await db.transaction(async (tx) => {
      // 3a. Activate ticket
      await tx.update(tickets).set({
        status:       'active',
        ticketNumber: issuedTicket.ticketNumber,
        issuedAt:     new Date(),
        fareHalalas:  issuedTicket.fareHalalas  ?? body.fareHalalas  ?? pnr.fareHalalas,
        taxHalalas:   issuedTicket.taxHalalas   ?? body.taxHalalas   ?? pnr.taxHalalas,
        totalHalalas: issuedTicket.totalHalalas ?? body.totalHalalas ?? pnr.totalHalalas,
        updatedAt:    new Date(),
      }).where(eq(tickets.id, ticketId));

      // 3b. Create coupons (one per flight segment)
      const segments = pnr.segments ?? [];
      if (segments.length > 0) {
        await tx.insert(ticketCoupons).values(
          segments.map((_, idx) => ({
            id:           crypto.randomUUID(),
            ticketId,
            segmentIndex: idx,
            couponStatus: issuedTicket.couponStatuses[idx] ?? 'open',
          })),
        );
      }

      // 3c. Mark PNR as ticketed
      await tx.update(pnrRecords)
        .set({ status: 'ticketed', updatedAt: new Date() })
        .where(eq(pnrRecords.id, body.pnrId));
    });

    // ── Post-commit side effects ─────────────────────────────────────────────
    logProviderSync({ agencyId, provider: providerCode, operation: 'issue_ticket', status: 'success', referenceId: ticketId, durationMs });
    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'ticket', resourceId: ticketId, after: { ticketNumber: issuedTicket.ticketNumber, pnrId: body.pnrId, passengerName: body.passengerName } });
    void logTravelEvent({ agencyId, eventType: 'ticket_issued', provider: providerCode, resourceId: ticketId, resourceType: 'ticket', actorId: uid, payload: { ticketNumber: issuedTicket.ticketNumber, pnrCode: pnr.pnrCode, passengerName: body.passengerName } });

    return NextResponse.json({
      success:      true,
      ticketId,
      ticketNumber: issuedTicket.ticketNumber,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'ticket_issue_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
