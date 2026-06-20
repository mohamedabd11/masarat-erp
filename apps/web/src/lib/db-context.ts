import { sql } from 'drizzle-orm';
import { db } from './db';

/**
 * Wraps a database transaction with the current agency context.
 * Sets app.current_agency_id so PostgreSQL RLS policies can use it.
 * Usage: await withAgencyContext(agencyId, async (tx) => { ... })
 */
export async function withAgencyContext<T>(
  agencyId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_agency_id', ${agencyId}, true)`);
    return callback(tx as unknown as typeof db);
  });
}
