import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { getNextPaymentVoucherNumber } from '@/lib/invoice-counter';

interface SupplierPaymentBody {
  payeeName: string;
  expenseCategory: string;
  amountHalalas: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  bookingId?: string;
  bookingNumber?: string;
}

const EXPENSE_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  supplier:    { code: '5000', ar: 'تكلفة الخدمات',    en: 'Cost of Services' },
  operational: { code: '5100', ar: 'مصاريف تشغيلية',   en: 'Operating Expenses' },
  salaries:    { code: '5200', ar: 'رواتب وأجور',       en: 'Salaries' },
  office:      { code: '5300', ar: 'مصاريف مكتبية',    en: 'Office Expenses' },
  other:       { code: '5900', ar: 'مصاريف أخرى',      en: 'Other Expenses' },
};

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',          en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',     en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',     en: 'POS / Card' },
  check:         { code: '1110', ar: 'البنك',          en: 'Bank' },
};

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as SupplierPaymentBody;
    const {
      payeeName,
      expenseCategory,
      amountHalalas,
      paymentMethod,
      reference,
      notes,
      bookingId,
      bookingNumber,
    } = body;

    if (!payeeName || !expenseCategory || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const db = getFirestore();
    const result = await db.runTransaction(async (tx) => {
      const year = new Date().getFullYear();
      const voucherNumber = await getNextPaymentVoucherNumber(agencyId, year, tx);

      const now = Timestamp.now();
      const docRef = db.collection('supplier_payments').doc();
      const journalRef = db.collection('journal_entries').doc();

      const expenseAc = EXPENSE_ACCOUNT[expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
      const paymentAc = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['cash']!;

      tx.set(docRef, {
        agencyId,
        voucherNumber,
        payeeName,
        supplierName: payeeName,
        expenseCategory,
        amountHalalas,
        paymentMethod,
        reference: reference ?? '',
        notes: notes ?? '',
        bookingId: bookingId ?? null,
        bookingNumber: bookingNumber ?? null,
        status: 'completed',
        createdBy: uid,
        createdAt: now,
      });

      const period = `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`;

      tx.set(journalRef, {
        id: journalRef.id,
        agencyId,
        description: `سند صرف ${voucherNumber} — ${payeeName}`,
        status: 'posted',
        postedAt: now,
        createdAt: now,
        createdBy: uid,
        referenceId: docRef.id,
        referenceType: 'expense_payment',
        lines: [
          {
            lineNumber: 1,
            accountCode: expenseAc.code,
            accountName: { ar: expenseAc.ar, en: expenseAc.en },
            debit: amountHalalas,
            credit: 0,
            debitSAR: amountHalalas / 100,
            creditSAR: 0,
          },
          {
            lineNumber: 2,
            accountCode: paymentAc.code,
            accountName: { ar: paymentAc.ar, en: paymentAc.en },
            debit: 0,
            credit: amountHalalas,
            debitSAR: 0,
            creditSAR: amountHalalas / 100,
          },
        ],
        totalDebitHalalas: amountHalalas,
        totalCreditHalalas: amountHalalas,
        period,
        isBalanced: true,
        isAuto: true,
        entryDate: now,
      });

      return { id: docRef.id, voucherNumber };
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
