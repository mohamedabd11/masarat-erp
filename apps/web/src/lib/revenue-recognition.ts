/**
 * Deferred revenue recognition — multi-tenant batch run.
 *
 * Scans across all agencies for invoices whose deferred_until date has passed
 * and recognises their revenue:
 *   Dr 3201 Deferred Revenue - Travel   (subtotal excl. VAT)
 *      Cr 4100 Revenue - Travel Services (subtotal excl. VAT)
 *
 * Mirrors generateDueRecurringInvoices: each invoice is claimed and posted in
 * its own transaction, isolated by a try/catch, so one invoice's failure (e.g.
 * a closed accounting period) can never block or roll back another agency's —
 * or another invoice's — recognition.
 */
import { eq, and, lte, isNull, isNotNull, ne } from 'drizzle-orm';
import { db } from './db';
import { invoices, bookings, journalEntries, journalLines } from './schema';
import { getNextJournalNumber } from './invoice-counter';
import { assertPeriodOpen } from './period-lock';
import { GL } from './gl-accounts';

export interface RevenueRecognitionResult {
  recognized: number;
  skipped:    number;
  errors:     number;
  invoiceIds: string[];
}

export async function recognizeDueRevenue(now: Date = new Date()): Promise<RevenueRecognitionResult> {
  const today = now.toISOString().split('T')[0]!;
  const year  = Number(today.slice(0, 4));

  const due = await db.select({
    id:              invoices.id,
    agencyId:        invoices.agencyId,
    invoiceNumber:   invoices.invoiceNumber,
    subtotalHalalas: invoices.subtotalHalalas,
    bookingId:       invoices.bookingId,
  })
    .from(invoices)
    .where(and(
      isNotNull(invoices.deferredUntil),
      lte(invoices.deferredUntil, today),
      isNull(invoices.revenueRecognizedAt),
      ne(invoices.status, 'cancelled'),
    ))
    .limit(200);

  const out: RevenueRecognitionResult = { recognized: 0, skipped: 0, errors: 0, invoiceIds: [] };
  if (due.length === 0) return out;

  for (const inv of due) {
    try {
      const amount = inv.subtotalHalalas;

      const outcome = await db.transaction(async (tx) => {
        // Race-safe claim — mirrors generateDueRecurringInvoices: a conditional
        // UPDATE that only succeeds if no concurrent run already recognised this
        // invoice. The loser matches 0 rows, returns early, and posts nothing —
        // so the same deferral can never be recognised twice.
        const [claimed] = await tx.update(invoices)
          .set({ revenueRecognizedAt: today, updatedAt: now })
          .where(and(eq(invoices.id, inv.id), isNull(invoices.revenueRecognizedAt)))
          .returning({ id: invoices.id });
        if (!claimed) return 'already_claimed' as const;

        await assertPeriodOpen(inv.agencyId, today, tx);

        // Nothing to post for a zero-amount deferral — the claim above already
        // flags it as recognised so it is not re-scanned tomorrow.
        if (amount <= 0) return 'zero' as const;

        const jeId     = crypto.randomUUID();
        const jeNumber = await getNextJournalNumber(inv.agencyId, year, tx);

        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId:           inv.agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      `إثبات إيراد مؤجل - فاتورة ${inv.invoiceNumber}`,
          descriptionEn:      `Revenue recognition - Invoice ${inv.invoiceNumber}`,
          source:             'invoice',
          sourceId:           inv.id,
          isPosted:           true,
          totalDebitHalalas:  amount,
          totalCreditHalalas: amount,
          createdBy:          'system',
        });

        let revenueAc = GL.revenuePrincipal;
        if (inv.bookingId) {
          const [bk] = await tx.select({ details: bookings.details })
            .from(bookings).where(eq(bookings.id, inv.bookingId));
          const details = (bk?.details ?? {}) as Record<string, unknown>;
          if (details['revenueModel'] === 'agent') revenueAc = GL.revenueAgent;
        }
        const lines = [
          { ac: GL.deferredRevenue, dr: amount, cr: 0 },
          { ac: revenueAc,          dr: 0,      cr: amount },
        ];
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i]!;
          await tx.insert(journalLines).values({
            id:            crypto.randomUUID(),
            entryId:       jeId,
            agencyId:      inv.agencyId,
            accountCode:   l.ac.code,
            accountNameAr: l.ac.ar,
            accountNameEn: l.ac.en,
            debitHalalas:  l.dr,
            creditHalalas: l.cr,
            sortOrder:     i + 1,
          });
        }

        return 'posted' as const;
      });

      if (outcome === 'posted')      { out.recognized++; out.invoiceIds.push(inv.id); }
      else if (outcome === 'zero')   { out.skipped++; }
      // 'already_claimed' → a concurrent run already handled this invoice this run
    } catch (err) {
      out.errors++;
      console.error(JSON.stringify({ event: 'revenue_recognition_failed', invoiceId: inv.id, agencyId: inv.agencyId, error: String(err) }));
    }
  }

  return out;
}
