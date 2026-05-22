/**
 * Invoice Sequential Counter
 *
 * المشكلة: أرقام الفواتير يجب أن تكون تسلسلية بلا فجوات (إلزامي قانونياً لـ ZATCA).
 * إذا استخدمنا Batch Write عادي، قد يحصل طلبان متزامنان على نفس الرقم.
 *
 * الحل: Firestore Transaction مع قراءة + زيادة + كتابة في عملية ذرية واحدة.
 * هذا يضمن أن كل فاتورة تحصل على رقم فريد، حتى في حالات التزامن العالي.
 *
 * الهيكل في Firestore:
 *   /agencies/{agencyId}/config/invoice_counters
 *     taxInvoice: number    ← عداد الفواتير الضريبية
 *     creditNote: number    ← عداد الإشعارات الدائنة
 *     debitNote: number     ← عداد الإشعارات المدينة
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export type InvoiceType = 'taxInvoice' | 'creditNote' | 'debitNote';

/** بادئات الأرقام حسب نوع الوثيقة */
const PREFIX: Record<InvoiceType, string> = {
  taxInvoice: 'INV',
  creditNote: 'CN',
  debitNote:  'DN',
};

/**
 * يحصل على الرقم التسلسلي التالي للفاتورة بشكل ذري.
 *
 * يُستخدم داخل Firestore Transaction لضمان عدم تكرار الأرقام.
 * لا تستدع هذه الدالة خارج Transaction.
 *
 * @returns رقم الفاتورة بتنسيق: INV-2026-001547
 */
export async function getNextInvoiceNumber(
  agencyId: string,
  invoiceType: InvoiceType,
  year: number,
  transaction: FirebaseFirestore.Transaction
): Promise<string> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const counterDoc = await transaction.get(counterRef);

  let currentCounter = 0;

  if (!counterDoc.exists) {
    // أول فاتورة للوكالة — أنشئ العداد
    transaction.set(counterRef, {
      taxInvoice: 0,
      creditNote: 0,
      debitNote: 0,
      createdAt: new Date(),
    });
  } else {
    currentCounter = (counterDoc.data()?.[invoiceType] as number) ?? 0;
  }

  const nextNumber = currentCounter + 1;

  // تحديث العداد ذرياً داخل نفس الـ Transaction
  transaction.update(counterRef, {
    [invoiceType]: FieldValue.increment(1),
    lastUpdatedAt: new Date(),
  });

  // تنسيق الرقم: INV-2026-001547
  const paddedNumber = String(nextNumber).padStart(6, '0');
  return `${PREFIX[invoiceType]}-${year}-${paddedNumber}`;
}

/**
 * يستعلم عن آخر أرقام الفواتير (للعرض في لوحة التحكم).
 * للقراءة فقط — لا يُعدِّل الأرقام.
 */
export async function getInvoiceCounters(
  agencyId: string
): Promise<Record<InvoiceType, number>> {
  const db = getFirestore();
  const counterRef = db
    .collection('agencies')
    .doc(agencyId)
    .collection('config')
    .doc('invoice_counters');

  const doc = await counterRef.get();

  if (!doc.exists) {
    return { taxInvoice: 0, creditNote: 0, debitNote: 0 };
  }

  const data = doc.data()!;
  return {
    taxInvoice: (data['taxInvoice'] as number) ?? 0,
    creditNote: (data['creditNote'] as number) ?? 0,
    debitNote:  (data['debitNote'] as number) ?? 0,
  };
}
