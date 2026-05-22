/**
 * Idempotency Guard
 *
 * المشكلة: إذا انقطع الاتصال بعد الكتابة لـ Firestore وقبل إرجاع الرد،
 * سيُعيد الـ Client الطلب مرة أخرى → تُنشأ فاتورتان أو قيدان لنفس المعاملة.
 *
 * الحل: كل طلب يحمل idempotencyKey فريداً (UUID يُولِّده الـ Client).
 * قبل تنفيذ أي عملية، نتحقق: "هل نُفِّذ هذا الطلب من قبل؟"
 *   - نعم → نُعيد نفس النتيجة السابقة (لا نُنفِّذ مجدداً)
 *   - لا  → ننفذ ونحفظ السجل
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/** مدة حفظ سجلات Idempotency (24 ساعة) */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRecord {
  key: string;
  agencyId: string;
  operation: string;
  status: 'completed' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * يتحقق من وجود سجل Idempotency ويُعيده إذا وُجد.
 * @returns السجل السابق أو null إذا كان الطلب جديداً
 */
export async function checkIdempotency(
  idempotencyKey: string,
  agencyId: string,
  operation: string
): Promise<IdempotencyRecord | null> {
  const db = getFirestore();
  const docRef = db
    .collection('idempotency_keys')
    .doc(`${agencyId}_${operation}_${idempotencyKey}`);

  const doc = await docRef.get();

  if (!doc.exists) return null;

  const record = doc.data() as IdempotencyRecord;

  // تحقق من انتهاء صلاحية السجل
  if (record.expiresAt.toMillis() < Date.now()) {
    await docRef.delete(); // تنظيف السجل المنتهي
    return null;
  }

  return record;
}

/**
 * يحفظ سجل Idempotency بعد تنفيذ العملية بنجاح.
 * يُستدعى داخل نفس الـ batch/transaction للضمان الذري.
 */
export function buildIdempotencyWrite(
  batch: FirebaseFirestore.WriteBatch,
  idempotencyKey: string,
  agencyId: string,
  operation: string,
  result: unknown
): void {
  const db = getFirestore();
  const docRef = db
    .collection('idempotency_keys')
    .doc(`${agencyId}_${operation}_${idempotencyKey}`);

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(Date.now() + IDEMPOTENCY_TTL_MS);

  const record: IdempotencyRecord = {
    key: idempotencyKey,
    agencyId,
    operation,
    status: 'completed',
    result,
    createdAt: now,
    expiresAt,
  };

  batch.set(docRef, record);
}

/**
 * Wrapper يُشغِّل أي عملية مع حماية Idempotency كاملة.
 *
 * @param key - UUID فريد من الـ Client
 * @param agencyId - معرّف الوكالة
 * @param operation - اسم العملية ('createInvoice' / 'processPayment' / ...)
 * @param fn - الدالة المطلوب تنفيذها (إذا لم يُنفَّذ الطلب من قبل)
 * @returns النتيجة (من cache أو من التنفيذ الجديد)
 */
export async function withIdempotency<T>(
  key: string,
  agencyId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!key || key.trim() === '') {
    throw new Error(
      `idempotencyKey مطلوب لعملية "${operation}". ` +
      `الـ Client يجب أن يُولِّد UUID فريداً لكل طلب.`
    );
  }

  // تحقق: هل نُفِّذ الطلب من قبل؟
  const existing = await checkIdempotency(key, agencyId, operation);
  if (existing) {
    if (existing.status === 'completed') {
      // إعادة النتيجة السابقة — لا تنفيذ مكرر
      return existing.result as T;
    }
    // إذا كانت حالة الفشل، نُعيد المحاولة (لأن العملية لم تكتمل)
  }

  // تنفيذ العملية الجديدة
  return fn();
}
