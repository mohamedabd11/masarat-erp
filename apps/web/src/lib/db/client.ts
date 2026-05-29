/**
 * Transaction-capable Database Client
 *
 * Neon + Drizzle في بيئة Serverless:
 * - HTTP transport: للـ queries العادية (أسرع + أرخص)
 * - WebSocket Pool: للـ transactions (يحتاج interactive session)
 *
 * في Vercel Edge Runtime: HTTP فقط (لا WebSocket)
 * في Vercel Node.js Runtime: HTTP + WebSocket
 */

import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import * as schema from '@masarat/database/schema';

function getUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

/**
 * HTTP Client — للـ queries العادية (SELECT, INSERT فردي)
 * يعمل في Edge Runtime وNode.js
 */
export function getHttpClient() {
  const sql = neon(getUrl());
  return drizzleHttp(sql, {
    schema,
    logger: process.env['NODE_ENV'] === 'development',
  });
}

/**
 * Pool Client — للـ transactions الذرية
 * يعمل فقط في Node.js Runtime (ليس Edge)
 * يُستخدم حصراً داخل withTransaction()
 */
let _pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    _pool = new Pool({ connectionString: getUrl() });
  }
  return _pool;
}

export function getPoolClient() {
  return drizzlePool(getPool(), { schema });
}

/**
 * تنفيذ عملية ذرية داخل PostgreSQL transaction
 * إذا فشلت أي خطوة → rollback تلقائي لكل شيء
 *
 * @example
 * const result = await withTransaction(agencyId, async (tx) => {
 *   const [invoice] = await tx.insert(invoices).values({...}).returning();
 *   await tx.insert(journalEntries).values({...});
 *   return invoice;
 * });
 */
export async function withTransaction<T>(
  agencyId: string,
  callback: (tx: ReturnType<typeof getPoolClient>) => Promise<T>
): Promise<T> {
  const db = getPoolClient();

  return db.transaction(async (tx) => {
    // تطبيق RLS context على هذه الـ transaction
    await tx.execute(`SELECT set_config('app.current_agency_id', '${agencyId}', true)`);
    return callback(tx as unknown as ReturnType<typeof getPoolClient>);
  });
}

/**
 * Query client مع RLS context — للـ queries خارج transactions
 */
export async function withQueryContext(agencyId: string) {
  const sql = neon(getUrl());

  // Set RLS context
  await sql`SELECT set_config('app.current_agency_id', ${agencyId}, false)`;

  return drizzleHttp(sql, { schema });
}

export type DbTransaction = Parameters<Parameters<ReturnType<typeof getPoolClient>['transaction']>[0]>[0];
