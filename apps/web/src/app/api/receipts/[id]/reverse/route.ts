import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { receiptVouchers, invoices, bookings, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
};
const AC_DEPOSITS = { code: '2300', ar: 'ودائع العملاء', en: 'Customer Deposits' };

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    const { reason } = await request.json() as { reason?: string };

    const result = await db.transaction(async (tx) => {
      const [orig] = await tx.select().from(receiptVouchers).where(
        and(eq(receiptVouchers.id, params.id), eq(receiptVouchers.agencyId, agencyId)),
      );
      if (!orig) throw new BusinessError('سند القبض غير موجود', 404);
      if (orig.isRefund === 'true') throw new BusinessError('لا يمكن عكس سند استرداد', 400);

      // Guard against double-reversal: a reversal voucher carries
      // originalVoucherId = this id. The friendly check below handles the common
      // case; a unique index (receipt_vouchers_reversal_uq) blocks the rare race.
      const [existingReversal] = await tx.select({ id: receiptVouchers.id }).from(receiptVouchers)
        .where(and(eq(receiptVouchers.originalVoucherId, params.id), eq(receiptVouchers.agencyId, agencyId)))
        .limit(1);
      if (existingReversal) throw new BusinessError('تم عكس سند القبض هذا مسبقاً', 409);

      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      await assertPeriodOpen(agencyId, today, tx);

      const { amountHalalas, method, customerName, voucherNumber } = orig;
      // Use AR (1120) if the receipt was invoice-linked; Customer Deposits (2300) if standalone
      const originalCreditAc = orig.invoiceId
        ? { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' }
        : AC_DEPOSITS;
      const paymentAc  = METHOD_ACCOUNT[method] ?? METHOD_ACCOUNT['cash']!;
      const revNumber  = await getNextReceiptNumber(agencyId, year, tx);
      const jeNumber   = await getNextJournalNumber(agencyId, year, tx);
      const reversalId = crypto.randomUUID();
      const jeId       = crypto.randomUUID();

      await tx.insert(receiptVouchers).values({
        id:               reversalId,
        agencyId,
        voucherNumber:    revNumber,
        customerName:     customerName,
        amountHalalas,
        method,
        description:      reason ? `عكس سند قبض ${voucherNumber} — ${reason}` : `عكس سند قبض ${voucherNumber}`,
        date:             today,
        journalEntryId:   jeId,
        isRefund:         'true',
        originalVoucherId: params.id,
        createdBy:        uid,
      });

      // Reversal journal: Credit cash/bank (money goes out), Debit customer deposits (liability decreases)
      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `عكس سند قبض ${voucherNumber} — ${customerName ?? ''}`,
        source:             'receipt',
        sourceId:           reversalId,
        isPosted:           true,
        totalDebitHalalas:  amountHalalas,
        totalCreditHalalas: amountHalalas,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        {
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: originalCreditAc.code, accountNameAr: originalCreditAc.ar, accountNameEn: originalCreditAc.en,
          debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1,
        },
        {
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en,
          debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2,
        },
      ]);

      // If the voucher was linked to an invoice, reduce paidHalalas and update status
      if (orig.invoiceId) {
        const [inv] = await tx.select().from(invoices)
          .where(and(eq(invoices.id, orig.invoiceId), eq(invoices.agencyId, agencyId)));
        if (inv) {
          const newPaid = Math.max(0, (inv.paidHalalas ?? 0) - amountHalalas);
          const newStatus = newPaid <= 0               ? 'refunded'
            : newPaid < inv.totalHalalas               ? 'partial'
            : inv.status;
          await tx.update(invoices)
            .set({ paidHalalas: newPaid, status: newStatus, updatedAt: now })
            .where(eq(invoices.id, orig.invoiceId));
        }
      }

      // Sync booking.paidHalalas if this receipt was linked to a booking
      if (orig.bookingId) {
        await tx.update(bookings)
          .set({
            paidHalalas: sql`GREATEST(0, ${bookings.paidHalalas} - ${amountHalalas})`,
            updatedAt: now,
          })
          .where(and(eq(bookings.id, orig.bookingId), eq(bookings.agencyId, agencyId)));
      }

      return { reversalId, voucherNumber: revNumber };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'receipt_reverse_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
