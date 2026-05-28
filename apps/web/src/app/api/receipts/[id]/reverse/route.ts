import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { receiptVouchers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';

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
      if (!orig) throw new Error('سند القبض غير موجود');
      if (orig.isRefund === 'true') throw new Error('لا يمكن عكس سند استرداد');

      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      const { amountHalalas, method, customerName, voucherNumber } = orig;
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
          accountCode: AC_DEPOSITS.code, accountNameAr: AC_DEPOSITS.ar, accountNameEn: AC_DEPOSITS.en,
          debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1,
        },
        {
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en,
          debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2,
        },
      ]);

      return { reversalId, voucherNumber: revNumber };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'receipt_reverse_failed', error: String(err) }));
    return NextResponse.json({ error: err instanceof Error ? err.message : 'خطأ في الخادم' }, { status: 500 });
  }
}
