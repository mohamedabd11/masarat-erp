import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProvider } from '@/lib/provider-factory';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';
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
// Financial note: refund posts a reversing journal entry that unwinds the
// revenue recognized at issuance/invoicing. The original principal posting was:
//   Dr 1120 Accounts Receivable   Cr 4100 Revenue - Travel Services
// The refund reverses it (self-balancing, by the ticket's totalHalalas):
//   Dr 4100 Revenue - Travel Services   Cr 1120 Accounts Receivable
// tagged journal_entries.service_type = 'ticket_refund'.
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

    // Phase 1: mark pending_refund
    await db.update(tickets)
      .set({ status: 'pending_refund', updatedAt: new Date() })
      .where(eq(tickets.id, params.id));

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

    // Phase 3: atomic local commit (status + coupons + reversing journal entry)
    const now  = new Date();
    const year = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;

    // Amount to reverse: prefer the provider-confirmed refund amount; fall back
    // to the ticket's recorded total. Halalas, integer, never negative.
    const reverseHalalas =
      typeof refundResult?.refundAmountHalalas === 'number' && refundResult.refundAmountHalalas > 0
        ? refundResult.refundAmountHalalas
        : (ticket.totalHalalas ?? 0);

    let journalEntryId: string | null = null;

    try {
      journalEntryId = await db.transaction(async (tx) => {
        await tx.update(tickets).set({
          status:     'refunded',
          refundedAt: now,
          updatedAt:  now,
        }).where(eq(tickets.id, params.id));

        await tx.update(ticketCoupons)
          .set({ couponStatus: 'refunded', updatedAt: now })
          .where(eq(ticketCoupons.ticketId, params.id));

        // No amount to reverse → operational refund only, no accounting impact.
        if (reverseHalalas <= 0) return null;

        // Block posting into a closed accounting period.
        await assertPeriodOpen(agencyId, today, tx);

        const jeId     = crypto.randomUUID();
        const jeNumber = await getNextJournalNumber(agencyId, year, tx);

        // Reverse the recognized revenue (self-balancing on totalHalalas):
        //   Dr 4100 Revenue - Travel Services   Cr 1120 Accounts Receivable
        const jLines = [
          { ...GL.revenuePrincipal, dr: reverseHalalas, cr: 0 },
          { ...GL.receivable,       dr: 0, cr: reverseHalalas },
        ];

        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      `استرداد تذكرة ${ticket.ticketNumber} - عكس الإيراد المعترف به`,
          source:             'receipt',
          sourceId:           params.id,
          serviceType:        'ticket_refund',
          isPosted:           true,
          totalDebitHalalas:  jLines.reduce((s, l) => s + l.dr, 0),
          totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
          createdBy:          uid,
        });

        for (let i = 0; i < jLines.length; i++) {
          const l = jLines[i]!;
          await tx.insert(journalLines).values({
            id: crypto.randomUUID(), entryId: jeId, agencyId,
            accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
            debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
          });
        }

        return jeId;
      });
    } catch (txErr) {
      // Period locked (BusinessError) or any local-commit failure: ticket stays
      // 'pending_refund' so the reconcile cron can heal Phase 3 (no second
      // provider call needed). Surface 4xx for a closed period, else re-throw.
      if (txErr instanceof BusinessError) {
        logProviderSync({ agencyId, provider: providerCode, operation: 'refund_ticket', status: 'success', referenceId: params.id, durationMs });
        return NextResponse.json({ error: txErr.message }, { status: txErr.status });
      }
      throw txErr;
    }

    logProviderSync({ agencyId, provider: providerCode, operation: 'refund_ticket', status: 'success', referenceId: params.id, durationMs });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'ticket', resourceId: params.id, before: { status: 'active', ticketNumber: ticket.ticketNumber }, after: { status: 'refunded', refundReference: refundResult?.refundReference, journalEntryId, reversedHalalas: journalEntryId ? reverseHalalas : 0 } });
    void logTravelEvent({ agencyId, eventType: 'ticket_refunded', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { ticketNumber: ticket.ticketNumber, refundReference: refundResult?.refundReference, refundAmountHalalas: refundResult?.refundAmountHalalas, reason: body.reason, journalEntryId } });

    return NextResponse.json({
      success:             true,
      refundReference:     refundResult?.refundReference,
      refundAmountHalalas: refundResult?.refundAmountHalalas,
      journalEntryId,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'ticket_refund_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
