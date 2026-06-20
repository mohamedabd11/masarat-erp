import { sql } from 'drizzle-orm';
import type { Tx } from './db';

/**
 * Lift the financial-record immutability triggers (see instrumentation.ts —
 * TRIG-1) for the CURRENT transaction only, by setting the transaction-local
 * `app.allow_financial_purge` GUC the triggers check.
 *
 * Reserved for the few deliberate maintenance paths that must remove posted
 * financial rows: agency teardown (admin/wipe-agency), year-end closing-entry
 * replacement (accounting/periods) and bank-account removal
 * (banking/accounts/[id]). Call it inside the same `db.transaction` as the
 * delete, before issuing it.
 */
export async function allowFinancialPurge(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.allow_financial_purge', 'on', true)`);
}
