import { NextResponse } from 'next/server';
import { eq, and, lte, isNull, isNotNull, ne, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

// POST { invoiceIds?: string[] }
// Recognises deferred travel revenue once the service has been delivered:
//   Dr 3201 Deferred Revenue - Travel  (subtotal excl. VAT)
//      Cr 4100 Revenue - Travel Services (subtotal excl. VAT)
//
// Targets invoices whose deferred_until date has passed, that are not cancelled
// and have not already been recognised. If invoiceIds is supplied, only those
// (still subject to the same eligibility filters) are processed.
export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json().catch(() => ({})) as { invoiceIds?: string[] };
    const today = new Date().toISOString().split('T')[0]!;

    const conditions = [
      eq(invoices.agencyId, agencyId),
      isNotNull(invoices.deferredUntil),
      lte(invoices.deferredUntil, today),
      isNull(invoices.revenueRecognizedAt),
      ne(invoices.status, 'cancelled'),
    ];
    if (Array.isArray(body.invoiceIds) && body.invoiceIds.length > 0) {
      conditions.push(inArray(invoices.id, body.invoiceIds));
    }

    const due = await db.select({
      id:              invoices.id,
      invoiceNumber:   invoices.invoiceNumber,
      subtotalHalalas: invoices.subtotalHalalas,
      bookingId:       invoices.bookingId,
    })
      .from(invoices)
      .where(and(...conditions));

    if (due.length === 0) {
      return NextResponse.json({ success: true, recognized: 0, invoices: [] });
    }

    const year      = Number(today.slice(0, 4));
    const recognized: Array<{ id: string; invoiceNumber: string; amountHalalas: number; journalEntryId: string }> = [];

    await db.transaction(async (tx) => {
      await assertPeriodOpen(agencyId, today, tx);
      for (const inv of due) {
        // Race-safe claim: atomically flag the invoice as recognised ONLY if it
        // hasn't been already (mirrors recognizeDueRevenue in the cron path). A
        // concurrent run — cron + manual, or a double POST — matches 0 rows here
        // and is skipped, so the same deferral can never be recognised twice
        // (which would double-count both revenue and output VAT).
        const [claimed] = await tx.update(invoices)
          .set({ revenueRecognizedAt: today, updatedAt: new Date() })
          .where(and(eq(invoices.id, inv.id), isNull(invoices.revenueRecognizedAt)))
          .returning({ id: invoices.id });
        if (!claimed) continue;

        // The deferred amount is the revenue portion (subtotal excl. VAT). VAT was
        // already posted to VAT Payable at issuance and is not deferred. Nothing to
        // post for a zero-amount deferral — the claim above already flagged it.
        const amount = inv.subtotalHalalas;
        if (amount <= 0) continue;

        const jeId     = crypto.randomUUID();
        const jeNumber = await getNextJournalNumber(agencyId, year, tx);

        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      `إثبات إيراد مؤجل - فاتورة ${inv.invoiceNumber}`,
          descriptionEn:      `Revenue recognition - Invoice ${inv.invoiceNumber}`,
          source:             'invoice',
          sourceId:           inv.id,
          isPosted:           true,
          totalDebitHalalas:  amount,
          totalCreditHalalas: amount,
          createdBy:          uid,
        });

        let revenueAc: { code: string; ar: string; en: string } = GL.revenuePrincipal;
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
            agencyId,
            accountCode:   l.ac.code,
            accountNameAr: l.ac.ar,
            accountNameEn: l.ac.en,
            debitHalalas:  l.dr,
            creditHalalas: l.cr,
            sortOrder:     i + 1,
          });
        }

        recognized.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, amountHalalas: amount, journalEntryId: jeId });
      }
    });

    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'invoice_revenue_recognition', resourceId: agencyId, after: { count: recognized.length, invoiceIds: recognized.map((r) => r.id) } });
    return NextResponse.json({ success: true, recognized: recognized.length, invoices: recognized });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'recognize_revenue_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
