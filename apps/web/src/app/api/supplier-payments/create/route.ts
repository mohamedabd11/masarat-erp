import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { supplierPayments, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { getNextPaymentVoucherNumber, getNextJournalNumber } from '@/lib/invoice-counter';

interface SupplierPaymentBody {
  payeeName:       string;
  expenseCategory: string;
  amountHalalas:   number;
  paymentMethod:   string;
  reference?:      string;
  notes?:          string;
  bookingId?:      string;
  bookingNumber?:  string;
}

const EXPENSE_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  supplier:    { code: '5000', ar: 'تكلفة الخدمات',   en: 'Cost of Services' },
  operational: { code: '5100', ar: 'مصاريف تشغيلية',  en: 'Operating Expenses' },
  salaries:    { code: '5200', ar: 'رواتب وأجور',       en: 'Salaries' },
  office:      { code: '5300', ar: 'مصاريف مكتبية',    en: 'Office Expenses' },
  other:       { code: '5900', ar: 'مصاريف أخرى',      en: 'Other Expenses' },
};

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  check:         { code: '1110', ar: 'البنك',           en: 'Bank' },
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as SupplierPaymentBody;
    const { payeeName, expenseCategory, amountHalalas, paymentMethod, reference, notes, bookingId, bookingNumber } = body;

    if (!payeeName || !expenseCategory || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      const voucherNumber = await getNextPaymentVoucherNumber(agencyId, year, tx);
      const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
      const spId          = crypto.randomUUID();
      const jeId          = crypto.randomUUID();

      const expenseAc = EXPENSE_ACCOUNT[expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
      const paymentAc = METHOD_ACCOUNT[paymentMethod]    ?? METHOD_ACCOUNT['cash']!;

      await tx.insert(supplierPayments).values({
        id:              spId,
        agencyId,
        bookingId:       bookingId    ?? null,
        payeeName,
        supplierName:    payeeName,
        amountHalalas,
        method:          paymentMethod,
        reference:       reference    ?? null,
        voucherNumber,
        expenseCategory,
        bookingNumber:   bookingNumber ?? null,
        date:            today,
        status:          'completed',
        journalEntryId:  jeId,
        createdBy:       uid,
      });

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `سند صرف ${voucherNumber} — ${payeeName}`,
        source:             'payment',
        sourceId:           spId,
        isPosted:           true,
        totalDebitHalalas:  amountHalalas,
        totalCreditHalalas: amountHalalas,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
      ]);

      return { id: spId, voucherNumber };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'supplier_payment_create_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
