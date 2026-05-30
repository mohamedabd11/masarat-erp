import { pool } from './db';

export type PoolStatus = 'ok' | 'warning' | 'critical';

/**
 * Reads the current connection pool state and returns a status label.
 *
 * Thresholds (checked after DB operations so state is accurate):
 *   critical — queries are queued waiting for a connection (waitingCount > 0)
 *   warning  — all connections are checked out, none idle
 *   ok       — pool has idle connections or has not yet acquired any
 */
export function getPoolStatus(): PoolStatus {
  try {
    const waiting = pool.waitingCount ?? 0;
    const total   = pool.totalCount   ?? 0;
    const idle    = pool.idleCount    ?? total;

    if (waiting > 0)             return 'critical';
    if (total > 0 && idle === 0) return 'warning';
    return 'ok';
  } catch {
    return 'ok';
  }
}
