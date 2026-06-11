import { db } from './db';
import type { Tx } from './db';
import { idempotencyKeys } from './schema';
import { eq, sql } from 'drizzle-orm';

const TTL_MS = 24 * 60 * 60 * 1000;
// A 'pending' claim older than this is treated as abandoned (the request that
// claimed it crashed before completing) and may be taken over by a retry.
const PENDING_STALE_MS = 5 * 60 * 1000;

export async function withIdempotency<T>(
  key: string,
  agencyId: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const id = `${agencyId}_${operation}_${key}`;
  const now       = new Date();
  const expiresAt = new Date(Date.now() + TTL_MS);

  // Fast path: a completed, non-expired result is replayed verbatim.
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.id, id))
    .limit(1);

  if (existing?.status === 'complete' && existing.expiresAt && existing.expiresAt > now) {
    return existing.result as T;
  }

  // A genuinely in-progress request (pending and recently claimed) is rejected.
  if (existing?.status === 'pending' && existing.createdAt && (now.getTime() - existing.createdAt.getTime()) < PENDING_STALE_MS) {
    throw new Error('طلب مكرر قيد المعالجة — يرجى المحاولة مجدداً بعد لحظات');
  }

  // Atomically (re)claim the key. The conflict-update only fires for a row that
  // is re-claimable — failed, expired, or a stale/abandoned pending claim — so a
  // failed operation can be retried and a crashed pending claim never blocks
  // forever. A fresh complete/pending row fails the WHERE → 0 rows → duplicate.
  const claimed = await db
    .insert(idempotencyKeys)
    .values({ id, agencyId, status: 'pending', result: null, expiresAt, createdAt: now })
    .onConflictDoUpdate({
      target: idempotencyKeys.id,
      set:    { status: 'pending', result: null, expiresAt, createdAt: now },
      setWhere: sql`${idempotencyKeys.status} = 'failed'
        OR ${idempotencyKeys.expiresAt} IS NULL
        OR ${idempotencyKeys.expiresAt} < now()
        OR (${idempotencyKeys.status} = 'pending' AND ${idempotencyKeys.createdAt} < now() - interval '${sql.raw(String(PENDING_STALE_MS / 1000))} seconds')`,
    })
    .returning({ id: idempotencyKeys.id });

  if (claimed.length === 0) {
    // A concurrent request holds a fresh pending/complete claim.
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

/**
 * Atomically finalize an idempotency key INSIDE the business transaction (HIGH-2).
 *
 * `withIdempotency` pre-inserts a 'pending' claim and flips it to 'complete' AFTER
 * `fn()` commits — a crash in that window leaves the key 'pending', and a retry
 * after PENDING_STALE_MS re-runs the operation (double-post). Calling this inside
 * the same transaction makes commit-and-finalize atomic: on commit the key is
 * already 'complete', so any retry replays the stored result instead of re-posting.
 * The post-tx update in `withIdempotency` then becomes a harmless no-op fallback.
 *
 * Uses onConflictDoUpdate (not onConflictDoNothing) precisely because the 'pending'
 * row pre-inserted by withIdempotency already exists — DoNothing would be a no-op
 * and leave the key 'pending', defeating the fix.
 */
export async function markIdempotencyComplete(
  tx: Tx,
  agencyId: string,
  operation: string,
  key: string,
  result: unknown,
): Promise<void> {
  const values = buildIdempotencyInsert(agencyId, operation, key, result);
  await tx
    .insert(idempotencyKeys)
    .values(values)
    .onConflictDoUpdate({
      target: idempotencyKeys.id,
      set: {
        status:    'complete',
        result:    (values.result ?? null) as Record<string, unknown> | null,
        expiresAt: values.expiresAt,
      },
    });
}
