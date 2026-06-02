/**
 * Shared test database connection for integration tests.
 *
 * Uses node-postgres (pg) instead of @neondatabase/serverless so tests
 * can run against a local PostgreSQL instance without WebSocket/Neon.
 *
 * Set TEST_DATABASE_URL to override the default local connection.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/schema';

export const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://masarat_test:test123@127.0.0.1:5432/masarat_test';

// Skip all integration tests when no local DB is available
export const SKIP_IF_NO_DB = !TEST_DB_URL.includes('masarat_test') &&
  !process.env['TEST_DATABASE_URL'];

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getTestDb() {
  if (!_db) {
    _pool = new Pool({ connectionString: TEST_DB_URL, max: 5 });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export async function closeTestDb() {
  if (_pool) { await _pool.end(); _pool = null; _db = null; }
}

/** Run raw SQL — useful for TRUNCATE in cleanup */
export async function sql(query: string) {
  const pool = _pool ?? new Pool({ connectionString: TEST_DB_URL });
  const result = await pool.query(query);
  if (!_pool) await pool.end();
  return result;
}
