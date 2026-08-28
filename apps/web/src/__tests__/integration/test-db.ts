/**
 * Shared test database connection for integration tests.
 *
 * Uses node-postgres (pg) instead of @neondatabase/serverless so tests
 * can run against a local PostgreSQL instance without WebSocket/Neon.
 *
 * Set TEST_DATABASE_URL to an isolated local or CI database connection.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/schema';

export const TEST_DB_URL = process.env['TEST_DATABASE_URL'];

// Integration tests require a real PostgreSQL. They are opt-in: set
// TEST_DATABASE_URL to the connection string (e.g. the local docker test DB or a
// CI service) to run them. When it is unset, the suites skip cleanly instead of
// failing on an unreachable default connection.
export const SKIP_IF_NO_DB = !process.env['TEST_DATABASE_URL'];

function requireTestDbUrl(): string {
  if (!TEST_DB_URL) {
    throw new Error('TEST_DATABASE_URL is required for integration database access');
  }
  return TEST_DB_URL;
}

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getTestDb() {
  if (!_db) {
    _pool = new Pool({ connectionString: requireTestDbUrl(), max: 5 });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export async function closeTestDb() {
  if (_pool) { await _pool.end(); _pool = null; _db = null; }
}

/**
 * Run raw SQL for integration setup, assertions, and cleanup.
 *
 * DELETE statements run inside the same explicit maintenance context used by
 * production teardown jobs. This keeps test cleanup compatible with the
 * financial immutability triggers without weakening those triggers globally.
 */
export async function sql(query: string) {
  const pool = _pool ?? new Pool({ connectionString: requireTestDbUrl() });
  const ownsPool = !_pool;

  try {
    if (!query.trimStart().toUpperCase().startsWith('DELETE ')) {
      return await pool.query(query);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.allow_financial_purge', 'on', true)");
      const result = await client.query(query);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    if (ownsPool) await pool.end();
  }
}
