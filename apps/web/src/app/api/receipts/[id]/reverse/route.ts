import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { receiptVouchers, invoices, bookings, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  card:          GL.posCard,
  online:        GL.posCard,
};

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
      const paymentAc  = METHOD_ACCOUNT[method] ?? METHOD_ACCOUNT['cash']!;

      // Claim the invoice balance before writing the reversal. When a credit note
      // has already turned part of the customer's payment into a deposit, return
      // that deposit first and reopen AR only for the rest. This keeps the GL and
      // invoice subledger equal after any payment/credit/reversal sequence.
      let customerDebitLines: Array<{ code: string; ar: string; en: string; amount: number }> = [
        { ...GL.customerDeposits, amount: amountHalalas },
      ];
      if (orig.invoiceId) {
        const [updatedInvoice] = await tx.update(invoices)
          .set({
            paidHalalas: sql`${invoices.paidHalalas} - ${amountHalalas}`,
            status: sql`CASE
              WHEN ${invoices.creditedHalalas} >= ${invoices.totalHalalas} THEN 'credit_noted'
              WHEN ${invoices.paidHalalas} - ${amountHalalas} + ${invoices.creditedHalalas} >= ${invoices.totalHalalas} THEN 'paid'
              WHEN ${invoices.paidHalalas} - ${amountHalalas} <= 0 AND ${invoices.creditedHalalas} = 0 THEN 'issued'
              ELSE 'partial'
            END`,
            updatedAt: now,
          })
          .where(and(
            eq(invoices.id, orig.invoiceId),
            eq(invoices.agencyId, agencyId),
            sql`${invoices.status} IN ('paid', 'partial', 'credit_noted')`,
            sql`${invoices.paidHalalas} >= ${amountHalalas}`,
          ))
          .returning({
            id: invoices.id,
            totalHalalas: invoices.totalHalalas,
            paidHalalas: invoices.paidHalalas,
            creditedHalalas: invoices.creditedHalalas,
          });
        if (!updatedInvoice) {
          throw new BusinessError('تعذّر عكس السند — حالة الفاتورة أو رصيدها تغير، راجعها ثم حاول مجدداً', 409);
        }

        const depositsBefore = Math.max(
          0,
          updatedInvoice.paidHalalas + amountHalalas + updatedInvoice.creditedHalalas - updatedInvoice.totalHalalas,
        );
        const depositsAfter = Math.max(
          0,
          updatedInvoice.paidHalalas + updatedInvoice.creditedHalalas - updatedInvoice.totalHalalas,
        );
        const depositDebit = Math.min(amountHalalas, depositsBefore - depositsAfter);
        const receivableDebit = amountHalalas - depositDebit;
        customerDebitLines = [
          ...(depositDebit > 0 ? [{ ...GL.customerDeposits, amount: depositDebit }] : []),
          ...(receivableDebit > 0 ? [{ ...GL.receivable, amount: receivableDebit }] : []),
        ];
      }

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

      // Reversal journal: credit cash/bank (money goes out), debit the customer
      // deposit first and then AR for any newly reopened invoice balance.
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
        ...customerDebitLines.map((line, index) => ({
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: line.code, accountNameAr: line.ar, accountNameEn: line.en,
          debitHalalas: line.amount, creditHalalas: 0, sortOrder: index + 1,
        })),
        {
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en,
          debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: customerDebitLines.length + 1,
        },
      ]);

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
