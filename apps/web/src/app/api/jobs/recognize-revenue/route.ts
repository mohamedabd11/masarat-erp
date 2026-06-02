import { NextResponse } from 'next/server';
import { eq, and, lte, isNull, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines } from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

// JOB-01: Cron job for automatic deferred revenue recognition (IFRS 15).
// Invoked daily by Vercel Cron: "0 2 * * *"
// Authorization: Bearer ${CRON_SECRET}
//
// For every agency, finds invoices whose deferred_until date has passed
// and creates the recognition journal entry:
//   Dr 3201 Deferred Revenue – Travel
//      Cr 4100 Revenue – Travel Services
export async function GET(request: Request) {
  const secret = process.env['CRON_SECRET'];
  const isDev  = process.env['NODE_ENV'] !== 'production';

  if (!secret && !isDev) {
    console.error(JSON.stringify({ event: 'cron_misconfigured', route: 'recognize-revenue', reason: 'CRON_SECRET not set in production' }));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const today = new Date().toISOString().split('T')[0]!;
  const year  = Number(today.slice(0, 4));

  const due = await db
    .select({
      id:              invoices.id,
      agencyId:        invoices.agencyId,
      invoiceNumber:   invoices.invoiceNumber,
      subtotalHalalas: invoices.subtotalHalalas,
    })
    .from(invoices)
    .where(and(
      isNotNull(invoices.deferredUntil),
      lte(invoices.deferredUntil, today),
      isNull(invoices.revenueRecognizedAt),
      ne(invoices.status, 'cancelled'),
    ))
    .limit(500);

  if (due.length === 0) {
    return NextResponse.json({ success: true, recognized: 0 });
  }

  const recognized: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  // Each invoice is recognised in its OWN transaction so one bad row cannot roll
  // back the entire night's recognition for every other agency/invoice. The
  // operation is idempotent via revenueRecognizedAt (the WHERE filter above
  // excludes already-recognised invoices), so retrying a failed row is safe.
  for (const inv of due) {
    try {
      await db.transaction(async (tx) => {
        const amount = inv.subtotalHalalas;
        const now    = new Date();
        await assertPeriodOpen(inv.agencyId, today, tx);

        if (amount > 0) {
          const jeId  = crypto.randomUUID();
          const jeNum = await getNextJournalNumber(inv.agencyId, year, tx);

          await tx.insert(journalEntries).values({
            id:                 jeId,
            agencyId:           inv.agencyId,
            entryNumber:        jeNum,
            date:               today,
            descriptionAr:      `اعتراف بالإيراد — فاتورة ${inv.invoiceNumber}`,
            descriptionEn:      `Revenue recognition — invoice ${inv.invoiceNumber}`,
            source:             'revenue_recognition',
            sourceId:           inv.id,
            isPosted:           true,
            totalDebitHalalas:  amount,
            totalCreditHalalas: amount,
            createdBy:          'cron',
          });

          await tx.insert(journalLines).values([
            {
              id: crypto.randomUUID(), entryId: jeId, agencyId: inv.agencyId,
              accountCode: GL.deferredRevenue.code, accountNameAr: GL.deferredRevenue.ar, accountNameEn: GL.deferredRevenue.en,
              debitHalalas: amount, creditHalalas: 0, sortOrder: 1,
            },
            {
              id: crypto.randomUUID(), entryId: jeId, agencyId: inv.agencyId,
              accountCode: GL.revenuePrincipal.code, accountNameAr: GL.revenuePrincipal.ar, accountNameEn: GL.revenuePrincipal.en,
              debitHalalas: 0, creditHalalas: amount, sortOrder: 2,
            },
          ]);
        }

        await tx.update(invoices)
          .set({ revenueRecognizedAt: today, updatedAt: new Date() })
          .where(eq(invoices.id, inv.id));
      });
      recognized.push(inv.id);
    } catch (e) {
      errors.push({ id: inv.id, error: String(e) });
    }
  }

  console.log(JSON.stringify({ event: 'cron_recognize_revenue', recognized: recognized.length, errors: errors.length, date: today }));
  return NextResponse.json({ success: true, recognized: recognized.length, errors });
}
