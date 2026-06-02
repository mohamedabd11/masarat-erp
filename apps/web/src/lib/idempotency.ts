import { db } from './db';
import type { Tx } from './db';
import { idempotencyKeys } from './schema';
import { eq } from 'drizzle-orm';

const TTL_MS = 24 * 60 * 60 * 1000;

export async function withIdempotency<T>(
  key: string,
  agencyId: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const id = `${agencyId}_${operation}_${key}`;

  // Check for completed or in-progress request
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.id, id))
    .limit(1);

  if (existing?.status === 'complete' && existing.expiresAt && existing.expiresAt > new Date()) {
    return existing.result as T;
  }

  if (existing?.status === 'pending') {
    throw new Error('طلب مكرر قيد المعالجة — يرجى المحاولة مجدداً بعد لحظات');
  }

  // Claim the key with 'pending' status before executing
  try {
    await db.insert(idempotencyKeys).values({
      id,
      agencyId,
      status:    'pending',
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  } catch {
    // Another concurrent request already inserted — treat as duplicate
    throw new Error('طلب مكرر قيد المعالجة — يرجى المحاولة مجدداً بعد لحظات');
  }

  try {
    const result = await fn();
    await db.update(idempotencyKeys)
      .set({ status: 'complete', result: result as Record<string, unknown>, expiresAt: new Date(Date.now() + TTL_MS) })
      .where(eq(idempotencyKeys.id, id));
    return result;
  } catch (err) {
    await db.update(idempotencyKeys)
      .set({ status: 'failed' })
      .where(eq(idempotencyKeys.id, id));
    throw err;
  }
}

export function buildIdempotencyInsert(
  agencyId: string,
  operation: string,
  key: string,
  result: unknown,
  tx?: Tx,
): typeof idempotencyKeys.$inferInsert {
  void tx; // accepted but not needed here — caller inserts via tx
  return {
    id:        `${agencyId}_${operation}_${key}`,
    agencyId,
    status:    'complete',
    result,
    expiresAt: new Date(Date.now() + TTL_MS),
  };
}
