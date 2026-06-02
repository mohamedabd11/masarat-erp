import { db } from './db';
import type { Tx } from './db';
import { idempotencyKeys } from './schema';
import { eq } from 'drizzle-orm';

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * IDEM-01 fix: pre-insert the key as 'pending' BEFORE executing fn().
 *
 * Race-condition scenario (old code):
 *   Request A & B both SELECT → no key found → both call fn() → duplicate work.
 *
 * Fixed flow:
 *   1. INSERT key as 'pending' ON CONFLICT DO NOTHING.
 *   2. If the INSERT returned 0 rows, another request already claimed it.
 *      Re-read and return cached result if 'complete'; otherwise fall through
 *      (the business-logic guards — CAS, unique constraints — protect against
 *      double-execution in the narrow concurrent window).
 *   3. Call fn(). fn() UPDATEs the key to 'complete' at the end of its
 *      transaction (via buildIdempotencyUpdate).
 */
export async function withIdempotency<T>(
  key: string,
  agencyId: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const id = `${agencyId}_${operation}_${key}`;
  const expiresAt = new Date(Date.now() + TTL_MS);

  // Try to atomically claim the slot
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ id, agencyId, status: 'pending', result: null, expiresAt })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length === 0) {
    // Another request already claimed this key — check if it completed
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.id, id))
      .limit(1);

    if (existing?.status === 'complete' && existing.expiresAt && existing.expiresAt > new Date()) {
      return existing.result as T;
    }
    // Still pending (concurrent in-flight request). Fall through and execute;
    // downstream CAS / unique constraints prevent double-writes.
  }

  const result = await fn();

  // Transition to 'complete' so retries return the cached result instead of
  // re-executing. This is the only write that ever makes it to 'complete';
  // callers that call buildIdempotencyInsert inside their transaction hit a
  // conflict and do nothing (the pending row already exists).
  await db
    .update(idempotencyKeys)
    .set({ status: 'complete', result: result as unknown })
    .where(eq(idempotencyKeys.id, id));

  return result;
}

export function buildIdempotencyInsert(
  agencyId: string,
  operation: string,
  key: string,
  result: unknown,
  tx?: Tx,
): typeof idempotencyKeys.$inferInsert {
  void tx;
  return {
    id:        `${agencyId}_${operation}_${key}`,
    agencyId,
    status:    'complete',
    result,
    expiresAt: new Date(Date.now() + TTL_MS),
  };
}
