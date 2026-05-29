/**
 * Neon PostgreSQL Client — اتصال آمن مع connection pooling صحيح
 *
 * تصميم مُحسَّن لـ Serverless (Vercel/Next.js):
 * - نستخدم @neondatabase/serverless للاتصال عبر WebSocket أو HTTP
 * - نستخدم drizzle-orm للـ type-safe queries
 * - نتجنب connection leaks في serverless functions
 *
 * مهم: في serverless، كل request = connection جديد (لا connection pool تقليدي)
 * الحل: Neon's HTTP transport (بدون WebSocket overhead)
 */

import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema/index.js';

// تمكين WebSocket للـ transactions (مطلوب للـ interactive transactions)
// neonConfig.webSocketConstructor = ws; // للـ Node.js environment فقط

/**
 * إنشاء Drizzle client مع Neon HTTP transport
 * آمن للاستخدام في Vercel Edge Functions و Next.js Server Actions
 */
export function createDbClient(databaseUrl?: string) {
  const url = databaseUrl ?? process.env['DATABASE_URL'];

  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Set it in your environment variables.'
    );
  }

  const sql = neon(url);
  return drizzle(sql, { schema, logger: process.env['NODE_ENV'] === 'development' });
}

/**
 * Singleton pattern للـ development (يمنع إعادة إنشاء الـ client في كل hot-reload)
 * في production (serverless): كل invocation تُنشئ client جديد (طبيعي)
 */
const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createDbClient> | undefined;
};

export const db =
  globalForDb.db ??
  (process.env['DATABASE_URL'] ? createDbClient() : null);

if (process.env['NODE_ENV'] !== 'production') {
  globalForDb.db = db ?? undefined;
}

/**
 * Type helpers
 */
export type Database = ReturnType<typeof createDbClient>;
