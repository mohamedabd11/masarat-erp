/**
 * Auto-migration: adds columns that exist in the Drizzle schema but may be
 * missing in older databases (e.g. columns added after initial setup-db run).
 *
 * Uses IF NOT EXISTS so it is 100% safe to call on every request.
 * Module-level flag avoids re-checking within the same serverless warm instance.
 */
import { neon } from '@neondatabase/serverless';

let checked = false;

const MIGRATIONS = [
  // Soft-delete columns (added in feat/soft-delete)
  `ALTER TABLE bookings  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  // Journal entry reversal columns
  `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversal_of TEXT`,
  // Provider credential key-rotation columns
  `ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS key_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE provider_credentials ADD COLUMN IF NOT EXISTS encrypted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  // Cheques bank account link
  `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS bank_account_id TEXT`,
  // Travel events log (added in feat/amadeus-integration)
  `CREATE TABLE IF NOT EXISTS travel_events (
    id            TEXT PRIMARY KEY,
    agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    provider      TEXT NOT NULL,
    resource_id   TEXT,
    resource_type TEXT,
    actor_id      TEXT,
    payload       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_travel_events_agency ON travel_events(agency_id, created_at DESC)`,

  // ── Phase 6-E: PNR Schema Hardening ──────────────────────────────────────
  // segments JSONB: full multi-segment data (replaces scalar origin/destination for multi-leg)
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS segments       JSONB`,
  // passengers JSONB: full passenger list with passport details
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS passengers     JSONB`,
  // Provider sync tracking
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS synced_at      TIMESTAMPTZ`,
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS sync_status    TEXT`,
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS sync_error     TEXT`,
  // Soft delete & cancellation (replaces hard DELETE)
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ`,
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ`,
  `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS cancelled_by   TEXT`,
  // Fix expires_at: migrate TEXT column to TIMESTAMPTZ
  // USING clause handles ISO-8601 strings and NULL values safely
  `ALTER TABLE pnr_records
     ALTER COLUMN expires_at TYPE TIMESTAMPTZ
     USING CASE
       WHEN expires_at IS NULL THEN NULL
       ELSE expires_at::TIMESTAMPTZ
     END`,
  // Fix legacy TEXT columns to match setup-db JSONB definition
  `ALTER TABLE pnr_records ALTER COLUMN flight_numbers  TYPE JSONB USING flight_numbers::JSONB`,
  `ALTER TABLE pnr_records ALTER COLUMN passenger_names TYPE JSONB USING passenger_names::JSONB`,
  `ALTER TABLE pnr_records ALTER COLUMN ticket_numbers  TYPE JSONB USING ticket_numbers::JSONB`,
  // Indexes for soft-delete and sync queries
  `CREATE INDEX IF NOT EXISTS idx_pnr_deleted   ON pnr_records(agency_id, deleted_at)    WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_pnr_expires   ON pnr_records(agency_id, expires_at)    WHERE expires_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_pnr_sync      ON pnr_records(agency_id, synced_at)     WHERE synced_at IS NOT NULL`,
];

export async function ensureMigrations(): Promise<void> {
  if (checked) return;
  if (!process.env.DATABASE_URL) return;

  try {
    const sql = neon(process.env.DATABASE_URL);
    for (const stmt of MIGRATIONS) {
      await sql.query(stmt);
    }
    checked = true;
  } catch {
    // Never throw — migration failure must not break the API response
  }
}
