/**
 * processPayment — Cloud Function Handler
 *
 * العملية الذرية لتسجيل دفعة:
 *   داخل Transaction واحدة:
 *     1. قراءة الحجز والفاتورة
 *     2. التحقق: المبلغ لا يتجاوز الرصيد المتبقي
 *     3. توليد قيد محاسبي للدفعة
 *     4. كتابة: سجل الدفعة + القيد + تحديث الفاتورة والحجز
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { withIdempotency } from '../lib/idempotency';

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'credit_card'
  | 'mada'
  | 'apple_pay'
  | 'stc_pay'
  | 'tamara'
  | 'tabby'
  | 'cheque';

export interface ProcessPaymentRequest {
  idempotencyKey: string;
  agencyId: string;
  bookingId: string;
  invoiceId: string;

  /** المبلغ المُستلم بالهللات */
  amountHalalas: number;
  method: PaymentMethod;
  methodDetails?: Record<string, string>;

  /** كود حساب البنك/الصندوق الذي استُلم فيه المبلغ */
  receivingAccountCode: string;
  receivedBy: string; // userId
}

export interface ProcessPaymentResult {
  paymentId: string;
  receiptNumber: string;
  amountPaid: number;  // بالريال
  remainingDue: number; // بالريال
  isFullyPaid: boolean;
}

export async function handleProcessPayment(
  req: ProcessPaymentRequest
): Promise<ProcessPaymentResult> {
  return withIdempotency(
    req.idempotencyKey,
    req.agencyId,
    'processPayment',
    () => executeProcessPayment(req)
  );
}

async function executeProcessPayment(
  req: ProcessPaymentRequest
): Promise<ProcessPaymentResult> {
  const db = getFirestore();
  const { agencyId, bookingId, invoiceId, amountHalalas, method, methodDetails, receivingAccountCode, receivedBy } = req;

  if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
    throw new Error(`مبلغ الدفعة غير صالح: ${amountHalalas}. يجب أن يكون عدداً صحيحاً موجباً بالهللات.`);
  }

  const result = await db.runTransaction(async (transaction) => {

    // 1. قراءة الفاتورة والحجز
    const [invoiceDoc, bookingDoc] = await Promise.all([
      transaction.get(db.collection('invoices').doc(invoiceId)),
      transaction.get(db.collection('bookings').doc(bookingId)),
    ]);

    if (!invoiceDoc.exists) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
    if (!bookingDoc.exists) throw new Error(`الحجز ${bookingId} غير موجود`);

    const invoice = invoiceDoc.data()!;
    const booking = bookingDoc.data()!;

    // تحقق الملكية
    if (invoice['agencyId'] !== agencyId) {
      throw new Error(`الفاتورة ${invoiceId} لا تنتمي للوكالة ${agencyId}`);
    }
    if (invoice['bookingId'] !== bookingId) {
      throw new Error(`الفاتورة ${invoiceId} لا تنتمي للحجز ${bookingId}`);
    }

    // 2. التحقق: المبلغ لا يتجاوز ما هو مستحق
    const currentAmountDue = invoice['amountDue'] as number;
    if (amountHalalas > currentAmountDue) {
      throw new Error(
        `المبلغ المُدخَل (${amountHalalas / 100} ر.س) ` +
        `يتجاوز المبلغ المستحق (${currentAmountDue / 100} ر.س). ` +
        `لا يُسمح بالدفع الزائد.`
      );
    }

    // 3. توليد رقم الإيصال
    const receiptNumber = await generateReceiptNumber(agencyId, transaction);

    // 4. حساب الحالة الجديدة بعد الدفعة
    const newAmountPaid = (invoice['amountPaid'] as number) + amountHalalas;
    const newAmountDue = currentAmountDue - amountHalalas;
    const newPaymentStatus = newAmountDue === 0 ? 'fully_paid'
      : newAmountDue < (invoice['totals'] as any).grandTotal ? 'partial'
      : 'unpaid';

    const now = Timestamp.now();

    // 5. إعداد المستندات
    const paymentRef = db.collection('bookings').doc(bookingId).collection('payments').doc();
    const journalRef = db.collection('journal_entries').doc();

    // قيد الدفعة:
    // DR: حساب البنك/الصندوق
    // CR: ذمم العميل (من حساب الفاتورة المفتوحة)
    const journalLines = [
      {
        lineNumber: 1,
        accountCode: receivingAccountCode,
        accountName: { ar: 'النقد / البنك', en: 'Cash / Bank' },
        debit: amountHalalas,
        credit: 0,
        description: `استلام دفعة — ${receiptNumber}`,
      },
      {
        lineNumber: 2,
        accountCode: '1101', // ذمم عملاء
        accountName: { ar: 'ذمم العملاء', en: 'Accounts Receivable' },
        debit: 0,
        credit: amountHalalas,
        description: `تسديد فاتورة ${invoice['invoiceNumber']}`,
      },
    ];

    // ── الكتابات الذرية ────────────────────────────────────────────────────
    transaction.set(paymentRef, {
      id: paymentRef.id,
      agencyId,
      bookingId,
      invoiceId,
      customerId: booking['customerId'],

      amount: amountHalalas,
      amountSAR: amountHalalas / 100,
      currency: 'SAR',

      method,
      methodDetails: methodDetails ?? {},

      receiptNumber,
      receivedAt: now,
      receivedBy,
      bankAccountCode: receivingAccountCode,

      journalEntryId: journalRef.id,
      isRefund: false,
      createdAt: now,
    });

    transaction.set(journalRef, {
      id: journalRef.id,
      agencyId,
      type: 'payment_received',
      reference: { type: 'payment', id: paymentRef.id, number: receiptNumber },
      description: `استلام دفعة — ${invoice['invoiceNumber']} — ${receiptNumber}`,
      entryDate: now,
      period: `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`,
      lines: journalLines,
      totalDebit: amountHalalas,
      totalCredit: amountHalalas,
      isBalanced: true,
      status: 'posted',
      isAuto: true,
      createdAt: now,
      createdBy: 'system',
      postedAt: now,
      postedBy: 'system',
    });

    transaction.update(db.collection('invoices').doc(invoiceId), {
      amountPaid: newAmountPaid,
      amountDue: newAmountDue,
      paymentStatus: newPaymentStatus,
      paymentIds: FieldValue.arrayUnion(paymentRef.id),
      updatedAt: now,
    });

    transaction.update(db.collection('bookings').doc(bookingId), {
      totalPaid: FieldValue.increment(amountHalalas),
      totalDue: FieldValue.increment(-amountHalalas),
      paymentStatus: newPaymentStatus,
      updatedAt: now,
    });

    // Idempotency داخل نفس الـ Transaction
    const idempotencyRef = db
      .collection('idempotency_keys')
      .doc(`${agencyId}_processPayment_${req.idempotencyKey}`);

    transaction.set(idempotencyRef, {
      key: req.idempotencyKey,
      agencyId,
      operation: 'processPayment',
      status: 'completed',
      result: { paymentId: paymentRef.id, receiptNumber },
      createdAt: now,
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });

    return {
      paymentId: paymentRef.id,
      receiptNumber,
      amountPaid: newAmountPaid / 100,
      remainingDue: newAmountDue / 100,
      isFullyPaid: newPaymentStatus === 'fully_paid',
    };
  });

  return result;
}

async function generateReceiptNumber(
  agencyId: string,
  transaction: FirebaseFirestore.Transaction
): Promise<string> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const doc = await transaction.get(counterRef);
  const current = (doc.data()?.['receipt'] as number) ?? 0;
  const next = current + 1;

  transaction.update(counterRef, {
    receipt: FieldValue.increment(1),
  });

  const year = new Date().getFullYear();
  return `RCT-${year}-${String(next).padStart(6, '0')}`;
}
