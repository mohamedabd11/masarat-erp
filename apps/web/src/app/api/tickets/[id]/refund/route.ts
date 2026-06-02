import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons, invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { resolveFlightProvider } from '@/lib/provider-factory';
import { getNextJournalNumber } from '@/lib/invoice-counter';
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

    // Phase 3: atomic local commit
    let reversalJournalEntryId: string | null = null;
    await db.transaction(async (tx) => {
      const now = new Date();

      await tx.update(tickets).set({
        status:     'refunded',
        refundedAt: now,
        updatedAt:  now,
      }).where(eq(tickets.id, params.id));

      await tx.update(ticketCoupons)
        .set({ couponStatus: 'refunded', updatedAt: now })
        .where(eq(ticketCoupons.ticketId, params.id));

      // ── Accounting reversal ────────────────────────────────────────────────
      // Refunding a ticket cancels the delivered service: the revenue and VAT
      // recognised at invoicing must be backed out of the trial balance.
      // We post a reversal journal entry that flips debit/credit of the original.
      //
      // Idempotency: the reconcile cron may replay Phase 3, so we only post the
      // reversal if one is not already recorded for this ticket.
      const [existingReversal] = await tx.select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.agencyId, agencyId),
          eq(journalEntries.source, 'ticket_refund'),
          eq(journalEntries.reference, params.id),
        ))
        .limit(1);

      if (!existingReversal) {
        const today = now.toISOString().split('T')[0]!;

        // The ticket itself is not financial (ADR-001) — revenue is posted by the
        // invoice. Find the invoice linked to this ticket's booking and reverse
        // its journal entry line-for-line so the reversal mirrors the original.
        let origLines: Array<{
          accountCode:   string;
          accountNameAr: string | null;
          accountNameEn: string | null;
          debitHalalas:  number;
          creditHalalas: number;
        }> = [];

        if (ticket.bookingId) {
          const [inv] = await tx.select({ journalEntryId: invoices.journalEntryId })
            .from(invoices)
            .where(and(
              eq(invoices.bookingId, ticket.bookingId),
              eq(invoices.agencyId, agencyId),
            ))
            .limit(1);

          if (inv?.journalEntryId) {
            origLines = await tx.select({
              accountCode:   journalLines.accountCode,
              accountNameAr: journalLines.accountNameAr,
              accountNameEn: journalLines.accountNameEn,
              debitHalalas:  journalLines.debitHalalas,
              creditHalalas: journalLines.creditHalalas,
            })
              .from(journalLines)
              .where(and(
                eq(journalLines.entryId, inv.journalEntryId),
                eq(journalLines.agencyId, agencyId),
              ));
          }
        }

        // Build the reversal lines by flipping debit ↔ credit on each source line.
        // Fallback (no invoice/journal found): reverse directly from the ticket's
        // fare/tax — Dr Revenue, Dr VAT Payable, Cr Accounts Receivable.
        let reversalLines: Array<{
          accountCode:   string;
          accountNameAr: string | null;
          accountNameEn: string | null;
          debitHalalas:  number;
          creditHalalas: number;
        }>;

        if (origLines.length > 0) {
          reversalLines = origLines.map((l) => ({
            accountCode:   l.accountCode,
            accountNameAr: l.accountNameAr,
            accountNameEn: l.accountNameEn,
            debitHalalas:  l.creditHalalas,
            creditHalalas: l.debitHalalas,
          }));
        } else {
          const fare  = ticket.fareHalalas ?? 0;
          const tax   = ticket.taxHalalas  ?? 0;
          const total = ticket.totalHalalas ?? (fare + tax);
          reversalLines = [
            { accountCode: GL.revenuePrincipal.code, accountNameAr: GL.revenuePrincipal.ar, accountNameEn: GL.revenuePrincipal.en, debitHalalas: fare,  creditHalalas: 0 },
            ...(tax > 0 ? [{ accountCode: GL.vatPayable.code, accountNameAr: GL.vatPayable.ar, accountNameEn: GL.vatPayable.en, debitHalalas: tax, creditHalalas: 0 }] : []),
            { accountCode: GL.receivable.code, accountNameAr: GL.receivable.ar, accountNameEn: GL.receivable.en, debitHalalas: 0, creditHalalas: total },
          ];
        }

        const totalDebit  = reversalLines.reduce((s, l) => s + l.debitHalalas,  0);
        const totalCredit = reversalLines.reduce((s, l) => s + l.creditHalalas, 0);

        // Only post when there is something to reverse and the entry balances.
        if (totalDebit > 0 && totalDebit === totalCredit) {
          const jeId    = crypto.randomUUID();
          const jeNumber = await getNextJournalNumber(agencyId, now.getFullYear(), tx);

          await tx.insert(journalEntries).values({
            id:                 jeId,
            agencyId,
            entryNumber:        jeNumber,
            date:               today,
            descriptionAr:      `قيد عكسي - استرداد تذكرة ${ticket.ticketNumber ?? ''}`,
            descriptionEn:      `Reversal - Ticket Refund ${ticket.ticketNumber ?? ''}`,
            source:             'ticket_refund',
            sourceId:           params.id,
            reference:          params.id,
            serviceType:        'flight',
            isPosted:           true,
            totalDebitHalalas:  totalDebit,
            totalCreditHalalas: totalCredit,
            createdBy:          uid,
          });

          await tx.insert(journalLines).values(
            reversalLines.map((l, i) => ({
              id:            crypto.randomUUID(),
              entryId:       jeId,
              agencyId,
              accountCode:   l.accountCode,
              accountNameAr: l.accountNameAr,
              accountNameEn: l.accountNameEn,
              debitHalalas:  l.debitHalalas,
              creditHalalas: l.creditHalalas,
              sortOrder:     i + 1,
            })),
          );

          reversalJournalEntryId = jeId;
        }
      }
    });

    logProviderSync({ agencyId, provider: providerCode, operation: 'refund_ticket', status: 'success', referenceId: params.id, durationMs });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'ticket', resourceId: params.id, before: { status: 'active', ticketNumber: ticket.ticketNumber }, after: { status: 'refunded', refundReference: refundResult?.refundReference, reversalJournalEntryId } });
    void logTravelEvent({ agencyId, eventType: 'ticket_refunded', provider: providerCode, resourceId: params.id, resourceType: 'ticket', actorId: uid, payload: { ticketNumber: ticket.ticketNumber, refundReference: refundResult?.refundReference, refundAmountHalalas: refundResult?.refundAmountHalalas, reason: body.reason } });

    return NextResponse.json({
      success:                 true,
      refundReference:         refundResult?.refundReference,
      refundAmountHalalas:     refundResult?.refundAmountHalalas,
      reversalJournalEntryId,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'ticket_refund_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
