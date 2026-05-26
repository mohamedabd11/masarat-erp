import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRecord {
  key: string;
  agencyId: string;
  operation: string;
  status: 'completed' | 'failed';
  result?: unknown;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export async function checkIdempotency(
  idempotencyKey: string,
  agencyId: string,
  operation: string,
): Promise<IdempotencyRecord | null> {
  const db = getFirestore();
  const docRef = db
    .collection('idempotency_keys')
    .doc(`${agencyId}_${operation}_${idempotencyKey}`);

  const doc = await docRef.get();
  if (!doc.exists) return null;

  const record = doc.data() as IdempotencyRecord;
  if (record.expiresAt.toMillis() < Date.now()) {
    await docRef.delete();
    return null;
  }
  return record;
}

export async function withIdempotency<T>(
  key: string,
  agencyId: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key?.trim()) {
    throw new Error(`idempotencyKey مطلوب لعملية "${operation}"`);
  }

  const existing = await checkIdempotency(key, agencyId, operation);
  if (existing?.status === 'completed') {
    return existing.result as T;
  }

  return fn();
}

export function idempotencyDoc(
  agencyId: string,
  operation: string,
  key: string,
  result: unknown,
): { ref: FirebaseFirestore.DocumentReference; data: IdempotencyRecord } {
  const db = getFirestore();
  const now = Timestamp.now();
  return {
    ref: db.collection('idempotency_keys').doc(`${agencyId}_${operation}_${key}`),
    data: {
      key,
      agencyId,
      operation,
      status: 'completed',
      result,
      createdAt: now,
      expiresAt: Timestamp.fromMillis(Date.now() + IDEMPOTENCY_TTL_MS),
    },
  };
}
