/**
 * Idempotency Guard — PostgreSQL Implementation
 *
 * يمنع تكرار العمليات المالية عند إعادة المحاولة بعد انقطاع الشبكة
 * يُعادل Firestore idempotency_keys collection
 *
 * آلية العمل:
 * 1. قبل تنفيذ العملية: تحقق من وجود المفتاح
 * 2. إذا موجود + ناجح → أعد النتيجة المحفوظة
 * 3. إذا غير موجود → نفذ العملية واحفظ النتيجة
 * 4. إذا موجود + فشل → أعد المحاولة (ربما عملية قيد التنفيذ)
 */

import { eq, sql } from 'drizzle-orm';
import { idempotencyKeys } from '@masarat/database/schema';
import { getHttpClient } from './db/client.js';

export class IdempotencyConflictError extends Error {
  constructor(public readonly cachedResult: unknown) {
    super('Idempotency key already used with different parameters');
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * تنفيذ عملية مع حماية Idempotency
 *
 * @param key - مفتاح UUID فريد يُولِّده الـ client
 * @param agencyId - معرف الوكالة
 * @param operation - اسم العملية
 * @param fn - الدالة التي تُنفِّذ العملية
 */
export async function withIdempotency<T>(
  key: string,
  agencyId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const db = getHttpClient();
  const compositeKey = `${agencyId}_${operation}_${key}`;
  const now = new Date();

  // 1. التحقق من وجود مفتاح سابق
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, compositeKey))
    .limit(1);

  if (existing) {
    if (existing.status === 'success' && existing.result) {
      // ✅ طلب مكرر — أعد النتيجة المحفوظة بدون إعادة تنفيذ
      return existing.result as T;
    }
    if (existing.status === 'processing') {
      throw new Error('Operation is already in progress. Please wait and retry.');
    }
    // failed → سنعيد المحاولة
  }

  // 2. تسجيل الطلب كـ "قيد التنفيذ"
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

  await db
    .insert(idempotencyKeys)
    .values({
      agencyId,
      key: compositeKey,
      operation,
      status: 'processing',
      expiresAt,
    })
    .onConflictDoUpdate({
      target: idempotencyKeys.key,
      set: { status: 'processing' },
    });

  // 3. تنفيذ العملية
  let result: T;
  try {
    result = await fn();
  } catch (error) {
    // فشلت العملية — سجل الفشل للـ debugging
    await db
      .update(idempotencyKeys)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      .where(eq(idempotencyKeys.key, compositeKey));

    throw error;
  }

  // 4. حفظ النتيجة للطلبات المكررة
  await db
    .update(idempotencyKeys)
    .set({
      status: 'success',
      result: result as Record<string, unknown>,
    })
    .where(eq(idempotencyKeys.key, compositeKey));

  return result;
}

/**
 * تنظيف مفاتيح الـ Idempotency المنتهية الصلاحية
 * يُشغَّل بواسطة Vercel Cron Job
 */
export async function cleanupExpiredKeys(): Promise<number> {
  const db = getHttpClient();
  const { count } = await import('drizzle-orm');

  const now = new Date();

  // Drizzle لا يدعم DELETE مع RETURNING count مباشرة
  // نستخدم raw SQL
  const result = await db.execute(
    sql`DELETE FROM idempotency_keys WHERE expires_at < NOW()`
  );

  return (result as unknown as { rowCount: number }).rowCount ?? 0;
}
