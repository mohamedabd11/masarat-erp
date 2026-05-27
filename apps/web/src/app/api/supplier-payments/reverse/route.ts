import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

interface ReverseBody {
  supplierPaymentId: string;
  reason?: string;
}

const EXPENSE_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  supplier:    { code: '5000', ar: 'تكلفة الخدمات',   en: 'Cost of Services' },
  operational: { code: '5100', ar: 'مصاريف تشغيلية',  en: 'Operating Expenses' },
  salaries:    { code: '5200', ar: 'رواتب وأجور',      en: 'Salaries' },
  office:      { code: '5300', ar: 'مصاريف مكتبية',   en: 'Office Expenses' },
  other:       { code: '5900', ar: 'مصاريف أخرى',     en: 'Other Expenses' },
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

    const body = await request.json() as ReverseBody;
    const { supplierPaymentId, reason } = body;

    if (!supplierPaymentId) {
      return NextResponse.json({ error: 'supplierPaymentId مطلوب' }, { status: 400 });
    }

    const db = getFirestore();
    const result = await db.runTransaction(async (tx) => {
      const origRef = db.collection('supplier_payments').doc(supplierPaymentId);
      const origSnap = await tx.get(origRef);

      if (!origSnap.exists) {
        throw new Error(`سند الصرف ${supplierPaymentId} غير موجود`);
      }

      const orig = origSnap.data()!;
      if (orig['agencyId'] !== agencyId) {
        throw new Error('سند الصرف لا ينتمي لوكالتك');
      }
      if (orig['type'] === 'reversal') {
        throw new Error('لا يمكن عكس سند استرداد');
      }
      if (orig['status'] === 'reversed') {
        throw new Error('سند الصرف مُعكوس بالفعل');
      }

      const amountHalalas = orig['amountHalalas'] as number;
      const paymentMethod = orig['paymentMethod'] as string;
      const expenseCategory = orig['expenseCategory'] as string;
      const payeeName = (orig['payeeName'] as string | undefined) ?? (orig['supplierName'] as string | undefined) ?? '';
      const originalVoucherNumber = (orig['voucherNumber'] as string | undefined) ?? supplierPaymentId;

      const now = Timestamp.now();
      const reversalRef = db.collection('supplier_payments').doc();
      const journalRef = db.collection('journal_entries').doc();

      const expenseAc = EXPENSE_ACCOUNT[expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
      const paymentAc = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['cash']!;

      const reversalVoucherNumber = `${originalVoucherNumber}-REV`;

      tx.set(reversalRef, {
        agencyId,
        type: 'reversal',
        originalId: supplierPaymentId,
        voucherNumber: reversalVoucherNumber,
        payeeName,
        supplierName: payeeName,
        expenseCategory,
        amountHalalas,
        paymentMethod,
        reason: reason ?? '',
        status: 'completed',
        createdBy: uid,
        createdAt: now,
      });

      const period = `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`;

      tx.set(journalRef, {
        id: journalRef.id,
        agencyId,
        description: `عكس سند صرف ${originalVoucherNumber} — ${payeeName}`,
        status: 'posted',
        postedAt: now,
        createdAt: now,
        createdBy: uid,
        referenceId: reversalRef.id,
        referenceType: 'expense_payment_reversal',
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
            accountCode: expenseAc.code,
            accountName: { ar: expenseAc.ar, en: expenseAc.en },
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

      tx.update(origRef, { status: 'reversed', reversedAt: now, reversedBy: uid });

      return { id: reversalRef.id, reversalVoucherNumber };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'supplier_payment_reverse_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
