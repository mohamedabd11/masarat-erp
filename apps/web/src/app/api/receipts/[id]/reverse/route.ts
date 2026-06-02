import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { receiptVouchers, invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
};
const AC_DEPOSITS   = GL.customerDeposits;
const AC_RECEIVABLE = GL.receivable;

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

      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      // Block reversal posting into a closed accounting period.
      await assertPeriodOpen(agencyId, today, tx);

      const { amountHalalas, method, customerName, voucherNumber } = orig;
      const paymentAc  = METHOD_ACCOUNT[method] ?? METHOD_ACCOUNT['cash']!;
      // The reversal debit must mirror the account the ORIGINAL receipt credited:
      //   invoice-applied receipt → credited 1120 AR  → reversal debits 1120 AR
      //   standalone deposit      → credited 2300 CD  → reversal debits 2300 CD
      // Always debiting 2300 would corrupt AR (and double-count deposits) for
      // invoice-applied receipts.
      const reversalDebitAc = orig.invoiceId ? AC_RECEIVABLE : AC_DEPOSITS;
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

      // Reversal journal: Credit cash/bank (money goes out), Debit the account the
      // original receipt credited (AR for invoice-applied, Customer Deposits otherwise).
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
          accountCode: reversalDebitAc.code, accountNameAr: reversalDebitAc.ar, accountNameEn: reversalDebitAc.en,
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
          const newStatus = newPaid <= 0               ? 'issued'
            : newPaid < inv.totalHalalas               ? 'partial'
            : inv.status;
          await tx.update(invoices)
            .set({ paidHalalas: newPaid, status: newStatus, updatedAt: now })
            .where(eq(invoices.id, orig.invoiceId));
        }
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
