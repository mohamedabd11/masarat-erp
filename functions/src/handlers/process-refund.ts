/**
 * processRefund — Cloud Function Handler
 *
 * العملية الذرية للاسترداد:
 *   داخل Transaction واحدة:
 *     1. قراءة الحجز والفاتورة الأصلية
 *     2. التحقق من صلاحية الاسترداد
 *     3. توليد قيد الاسترداد (عبر accounting engine)
 *     4. إنشاء إشعار دائن (Credit Note) بنفس آلية الفاتورة
 *     5. تسجيل القيد العكسي (Reversal Entry)
 *     6. تحديث حالة الحجز
 *
 * قاعدة أساسية: لا تُعدَّل القيود المنشورة — تُعكس فقط بقيد جديد.
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  generateJournalEntry,
  calculateVat,
  type AgencyAccountingConfig,
  type RefundInput,
} from '@masarat/accounting';

import { withIdempotency } from '../lib/idempotency';
import { getNextInvoiceNumber } from '../lib/invoice-counter';

export interface ProcessRefundRequest {
  idempotencyKey: string;
  agencyId: string;
  bookingId: string;
  originalInvoiceId: string;

  /** المبلغ الذي يُعاد للعميل (بالهللات) */
  refundAmountHalalas: number;
  /** رسوم الإلغاء التي تحتجزها الوكالة (بالهللات) */
  cancellationFeeHalalas: number;

  /** سبب الاسترداد */
  reason: string;
  /** حساب البنك الذي سيُخصَّم منه الاسترداد */
  refundAccountCode: string;
  /** حساب ذمم المورد (الذي سنطالبه بالاسترداد) */
  supplierReceivableAccountCode: string;

  processedBy: string;
}

export interface ProcessRefundResult {
  refundId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  journalEntryId: string;
  refundedAmount: number;  // بالريال
  cancellationFee: number; // بالريال
}

export async function handleProcessRefund(
  req: ProcessRefundRequest
): Promise<ProcessRefundResult> {
  return withIdempotency(
    req.idempotencyKey,
    req.agencyId,
    'processRefund',
    () => executeProcessRefund(req)
  );
}

async function executeProcessRefund(
  req: ProcessRefundRequest
): Promise<ProcessRefundResult> {
  const db = getFirestore();
  const {
    agencyId, bookingId, originalInvoiceId,
    refundAmountHalalas, cancellationFeeHalalas,
    reason, refundAccountCode, supplierReceivableAccountCode,
    processedBy,
  } = req;

  if (!Number.isInteger(refundAmountHalalas) || refundAmountHalalas < 0) {
    throw new Error(`مبلغ الاسترداد غير صالح: ${refundAmountHalalas}`);
  }

  const result = await db.runTransaction(async (transaction) => {

    // 1. قراءة البيانات
    const [invoiceDoc, bookingDoc, accountingConfigDoc] = await Promise.all([
      transaction.get(db.collection('invoices').doc(originalInvoiceId)),
      transaction.get(db.collection('bookings').doc(bookingId)),
      transaction.get(
        db.collection('agencies').doc(agencyId).collection('config').doc('accounting')
      ),
    ]);

    if (!invoiceDoc.exists) throw new Error(`الفاتورة ${originalInvoiceId} غير موجودة`);
    if (!bookingDoc.exists) throw new Error(`الحجز ${bookingId} غير موجود`);
    if (!accountingConfigDoc.exists) throw new Error(`إعدادات المحاسبة غير مكتملة`);

    const invoice = invoiceDoc.data()!;
    const booking = bookingDoc.data()!;
    const accountingConfig = accountingConfigDoc.data()! as AgencyAccountingConfig;

    // 2. التحققات
    if (invoice['agencyId'] !== agencyId) {
      throw new Error(`الفاتورة لا تنتمي لهذه الوكالة`);
    }
    if (invoice['status'] === 'cancelled') {
      throw new Error(`الفاتورة ${originalInvoiceId} ملغاة بالفعل`);
    }
    if (booking['status'] === 'cancelled') {
      throw new Error(`الحجز ${bookingId} ملغى بالفعل`);
    }

    const amountPaid = invoice['amountPaid'] as number;
    const totalRefundable = amountPaid;

    if (refundAmountHalalas + cancellationFeeHalalas > totalRefundable) {
      throw new Error(
        `مجموع الاسترداد (${(refundAmountHalalas + cancellationFeeHalalas) / 100} ر.س) ` +
        `يتجاوز المبلغ المدفوع (${totalRefundable / 100} ر.س)`
      );
    }

    // 3. حساب VAT على رسوم الإلغاء
    const cancellationFeeVat = calculateVat(cancellationFeeHalalas, accountingConfig.vatRate);

    // 4. توليد قيد الاسترداد
    const refundInput: RefundInput = {
      phase: 'refund_issued',
      refundAmountToCustomer: refundAmountHalalas,
      cancellationFee: cancellationFeeHalalas,
      cancellationFeeVat,
      supplierRefundReceivableAccount: supplierReceivableAccountCode,
      refundPaymentAccountCode: refundAccountCode,
      bookingRef: booking['id'],
      customerName: booking['customerName']?.ar ?? '',
    };

    const journalEntry = generateJournalEntry(refundInput, accountingConfig);

    // 5. رقم إشعار دائن تسلسلي
    const year = new Date().getFullYear();
    const creditNoteNumber = await getNextInvoiceNumber(agencyId, 'creditNote', year, transaction);

    const now = Timestamp.now();
    const creditNoteRef = db.collection('invoices').doc();
    const journalRef = db.collection('journal_entries').doc();
    const refundRef = db.collection('bookings').doc(bookingId).collection('payments').doc();

    // 6. وثيقة الإشعار الدائن (Credit Note)
    transaction.set(creditNoteRef, {
      id: creditNoteRef.id,
      agencyId,
      type: 'credit_note',
      invoiceNumber: creditNoteNumber,
      originalInvoiceId,
      originalInvoiceNumber: invoice['invoiceNumber'],
      bookingId,

      seller: invoice['seller'],
      buyer: invoice['buyer'],

      refundAmount: refundAmountHalalas,
      cancellationFee: cancellationFeeHalalas,
      cancellationFeeVat,
      totalCredited: refundAmountHalalas,

      reason,
      status: 'issued',

      zatca: {
        invoiceUUID: generateUUID(),
        invoiceTypeCode: '381', // إشعار دائن
        submissionStatus: 'not_submitted',
      },

      journalEntryId: journalRef.id,
      issueDate: now,
      createdAt: now,
      createdBy: processedBy,
    });

    // 7. القيد المحاسبي (Reversal Entry)
    transaction.set(journalRef, {
      id: journalRef.id,
      agencyId,
      type: 'refund_payment',
      reference: { type: 'credit_note', id: creditNoteRef.id, number: creditNoteNumber },
      description: journalEntry.description,
      entryDate: now,
      period: `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`,
      lines: journalEntry.lines,
      totalDebit: journalEntry.totalDebit,
      totalCredit: journalEntry.totalCredit,
      isBalanced: true,
      reversalOf: null, // ليس عكساً لقيد محدد — هو قيد جديد مستقل
      status: 'posted',
      isAuto: true,
      createdAt: now,
      createdBy: 'system',
      postedAt: now,
      postedBy: 'system',
    });

    // 8. سجل الاسترداد كـ payment سالب
    transaction.set(refundRef, {
      id: refundRef.id,
      agencyId,
      bookingId,
      invoiceId: creditNoteRef.id,
      originalInvoiceId,
      amount: -refundAmountHalalas, // سالب = استرداد
      currency: 'SAR',
      method: 'refund',
      receiptNumber: creditNoteNumber,
      receivedAt: now,
      receivedBy: processedBy,
      journalEntryId: journalRef.id,
      isRefund: true,
      refundedFrom: originalInvoiceId,
      reason,
      createdAt: now,
    });

    // 9. تحديث الحجز
    transaction.update(db.collection('bookings').doc(bookingId), {
      status: 'cancelled',
      cancelledAt: now,
      cancelReason: reason,
      paymentStatus: refundAmountHalalas === amountPaid ? 'refunded' : 'partial_refund',
      updatedAt: now,
    });

    // 10. تحديث الفاتورة الأصلية
    transaction.update(db.collection('invoices').doc(originalInvoiceId), {
      status: 'credited', // مُقابَلة بإشعار دائن
      updatedAt: now,
    });

    // Idempotency
    const idempotencyRef = db
      .collection('idempotency_keys')
      .doc(`${agencyId}_processRefund_${req.idempotencyKey}`);

    transaction.set(idempotencyRef, {
      key: req.idempotencyKey,
      agencyId,
      operation: 'processRefund',
      status: 'completed',
      result: { refundId: refundRef.id, creditNoteId: creditNoteRef.id, creditNoteNumber },
      createdAt: now,
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });

    return {
      refundId: refundRef.id,
      creditNoteId: creditNoteRef.id,
      creditNoteNumber,
      journalEntryId: journalRef.id,
      refundedAmount: refundAmountHalalas / 100,
      cancellationFee: cancellationFeeHalalas / 100,
    };
  });

  // جدولة إرسال الإشعار الدائن لـ ZATCA
  await scheduleZatcaSubmission(result.creditNoteId, agencyId).catch(console.error);

  return result;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function scheduleZatcaSubmission(documentId: string, agencyId: string): Promise<void> {
  const db = getFirestore();
  await db.collection('zatca_submission_queue').add({
    documentId,
    agencyId,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });
}
