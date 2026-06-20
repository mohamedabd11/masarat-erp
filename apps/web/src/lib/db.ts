import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import { getTenantAgencyId } from './tenant-context';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const database = drizzle(pool);

// ── Automatic tenant isolation (RLS) ──────────────────────────────────────────
// Every transaction opened during an authenticated request first sets
// `app.current_agency_id`, activating the PostgreSQL RLS policies installed by
// instrumentation.ts. A missing manual `WHERE agency_id` can therefore no longer
// leak rows across tenants. Bare (non-transactional) queries are untouched; the
// RLS policies are fail-open when no context is set, so cron/super-admin/auth
// paths keep working. Context comes from AsyncLocalStorage (./tenant-context),
// populated by verifyAuth — connection pooling makes a transaction the only place
// a SET reliably reaches the same connection as the following statements.
const runTransaction = database.transaction.bind(database);
type TxArg = Parameters<Parameters<typeof runTransaction>[0]>[0];
type TxConfig = Parameters<typeof runTransaction>[1];

const tenantTransaction = <T>(
  callback: (tx: TxArg) => Promise<T>,
  config?: TxConfig,
): Promise<T> =>
  runTransaction(async (tx) => {
    const agencyId = getTenantAgencyId();
    if (agencyId) {
      await tx.execute(sql`SELECT set_config('app.current_agency_id', ${agencyId}, true)`);
    }
    return callback(tx);
  }, config);

database.transaction = tenantTransaction as typeof database.transaction;

export const db = database;

export type DB = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
