import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { getNextReceiptNumber } from '@/lib/invoice-counter';

interface StandaloneReceiptBody {
  customerNameAr: string;
  customerNameEn?: string;
  customerPhone?: string;
  amountHalalas: number;
  paymentMethod: string;
  description?: string;
  reference?: string;
  notes?: string;
}

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',          en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',     en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',     en: 'POS / Card' },
};

const AC_DEPOSITS = { code: '2300', ar: 'ودائع العملاء', en: 'Customer Deposits' };

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as StandaloneReceiptBody;
    const {
      customerNameAr,
      customerNameEn,
      customerPhone,
      amountHalalas,
      paymentMethod,
      description,
      reference,
      notes,
    } = body;

    if (!customerNameAr || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const db = getFirestore();
    const result = await db.runTransaction(async (tx) => {
      const year = new Date().getFullYear();
      const receiptNumber = await getNextReceiptNumber(agencyId, year, tx);

      const now = Timestamp.now();
      const docRef = db.collection('payments').doc();
      const journalRef = db.collection('journal_entries').doc();

      const paymentAc = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['cash']!;

      tx.set(docRef, {
        agencyId,
        receiptNumber,
        customerNameAr,
        customerNameEn: customerNameEn ?? customerNameAr,
        customerPhone: customerPhone ?? '',
        amountHalalas,
        paymentMethod,
        description: description ?? '',
        reference: reference ?? '',
        notes: notes ?? '',
        invoiceId: null,
        bookingId: null,
        standalone: true,
        status: 'completed',
        createdBy: uid,
        createdAt: now,
      });

      const period = `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`;

      tx.set(journalRef, {
        id: journalRef.id,
        agencyId,
        description: `سند قبض ${receiptNumber} — ${customerNameAr}`,
        status: 'posted',
        postedAt: now,
        createdAt: now,
        createdBy: uid,
        referenceId: docRef.id,
        referenceType: 'receipt',
        lines: [
          {
            lineNumber: 1,
            accountCode: paymentAc.code,
            accountName: { ar: paymentAc.ar, en: paymentAc.en },
            debit: amountHalalas,
            credit: 0,
            debitSAR: amountHalalas / 100,
            creditSAR: 0,
          },
          {
            lineNumber: 2,
            accountCode: AC_DEPOSITS.code,
            accountName: { ar: AC_DEPOSITS.ar, en: AC_DEPOSITS.en },
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

      return { id: docRef.id, receiptNumber };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'receipt_create_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
