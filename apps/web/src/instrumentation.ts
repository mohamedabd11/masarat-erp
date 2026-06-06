/**
 * Next.js instrumentation hook — runs once on server startup (Node.js runtime only).
 * Applies idempotent SQL migrations so the DB stays in sync with the schema
 * without any manual intervention.
 *
 * Rules for adding migrations:
 *  - Every statement MUST be idempotent (IF NOT EXISTS / IF EXISTS).
 *  - Append new entries to the end of the array; never reorder or remove.
 */
export async function register() {
  // Only run in Node.js (not Edge runtime) and only when a DB is configured.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { validateEnv } = await import('@/lib/env-validate');
  validateEnv();

  if (!process.env.DATABASE_URL) return;

  const migrations: string[] = [
    // ── 2025-05 ────────────────────────────────────────────────────────────
    // cheques was created without bank_account_id; add it to existing tables.
    `ALTER TABLE cheques ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES bank_accounts(id)`,

    // agencies: new columns added post-initial-DDL
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS default_quote_terms    TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS max_users              INTEGER NOT NULL DEFAULT 5`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS trial_starts_at        TIMESTAMPTZ`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMPTZ`,

    // pnr_records: columns added in migration 0011
    `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS sync_status  TEXT`,
    `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS segments     JSONB`,
    `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS passengers   JSONB`,
    `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
    `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS cancelled_by TEXT`,
    `ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ`,

    // payslips: employer GOSI
    `ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gosi_employer_halalas INTEGER NOT NULL DEFAULT 0`,

    // service_types: revenue mode and VAT config
    `ALTER TABLE service_types ADD COLUMN IF NOT EXISTS revenue_mode TEXT NOT NULL DEFAULT 'principal'`,
    `ALTER TABLE service_types ADD COLUMN IF NOT EXISTS vat_rate     INTEGER`,
    `ALTER TABLE service_types ADD COLUMN IF NOT EXISTS is_taxable   BOOLEAN`,

    // customers: opening balance
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_halalas BIGINT NOT NULL DEFAULT 0`,

    // accounting_periods was missing from the original setup-db DDL.
    `CREATE TABLE IF NOT EXISTS accounting_periods (
      id            TEXT PRIMARY KEY,
      agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      period_year   INTEGER NOT NULL,
      period_month  INTEGER NOT NULL,
      is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
      locked_at     TIMESTAMPTZ,
      locked_by     TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS accounting_periods_agency_ym_uq
      ON accounting_periods(agency_id, period_year, period_month)`,

    // ── 2026-06 — Add missing COA account 1230 (Input VAT Receivable) ─────────
    `INSERT INTO chart_of_accounts (id, agency_id, code, name_ar, name_en, type, is_active, created_at, updated_at)
      SELECT gen_random_uuid(), id, '1230', 'ضريبة المدخلات القابلة للاسترداد', 'Input VAT Receivable', 'asset', true, NOW(), NOW()
      FROM agencies
      WHERE NOT EXISTS (
        SELECT 1 FROM chart_of_accounts coa
        WHERE coa.agency_id = agencies.id AND coa.code = '1230'
      )`,

    // ── 2026-06 — Missing columns detected by schema-DB audit ────────────────
    // customers: credit limit
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit_halalas BIGINT NOT NULL DEFAULT 0`,

    // bank_accounts: reconciliation tracking
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ`,
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS reconciled_balance_halalas BIGINT`,

    // bank_transactions: reconciliation flags
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ`,
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS reconciled_by TEXT`,

    // invoices: link credit/debit notes to original invoice
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_invoice_id TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deferred_until TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS revenue_recognized_at TEXT`,

    // quotes: conversion tracking
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS converted_to_booking_id TEXT`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ`,

    // ── 2026-06 — ZATCA Phase 2 columns ──────────────────────────────────────
    `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS service_type TEXT`,

    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_environment TEXT NOT NULL DEFAULT 'simulation'`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_onboarding_status TEXT NOT NULL DEFAULT 'not_started'`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_compliance_request_id TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_compliance_csid TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_compliance_secret TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_production_csid TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_production_secret TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_private_key TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_certificate_pem TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_certificate_expiry TIMESTAMPTZ`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_last_invoice_hash TEXT`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_onboarded_at TIMESTAMPTZ`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_error_message TEXT`,

    // ── 2026-06 — Quote conversion idempotency ────────────────────────────────
    // Prevents two concurrent POST /quotes/:id/convert requests from creating
    // two bookings from the same quote (race condition guard).
    `CREATE UNIQUE INDEX IF NOT EXISTS quotes_converted_booking_uq
      ON quotes(converted_to_booking_id)
      WHERE converted_to_booking_id IS NOT NULL`,

    // ── 2026-06 — Widen ALL monetary columns to BIGINT (overflow guard) ───────
    // INTEGER caps at ~2.147e9 halalas ≈ 21.47M SAR; Hajj/Umrah group invoices
    // and BSP remittances can exceed it. This block is self-discovering and
    // truly idempotent: it widens only "*_halalas" columns that are still
    // `integer`, so it does NO work (and takes no lock) once every column is
    // already bigint. Earlier DDL (setup-db / drizzle 0012) only widened these
    // on some provisioning paths — this guarantees it on every path.
    `DO $$
      DECLARE col record;
      BEGIN
        FOR col IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name ~ '_halalas$'
            AND data_type = 'integer'
        LOOP
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint', col.table_name, col.column_name);
        END LOOP;
      END $$`,

    // ── 2026-06 — Prevent double-reversal of a receipt voucher ────────────────
    // A reversal voucher stores originalVoucherId = the reversed voucher's id.
    // At most one reversal may exist per original (race-safe guard).
    `CREATE UNIQUE INDEX IF NOT EXISTS receipt_vouchers_reversal_uq
      ON receipt_vouchers(original_voucher_id)
      WHERE original_voucher_id IS NOT NULL`,

    // ── 2026-06 — IAS 21 foreign-currency tracking ────────────────────────────
    // Track foreign-currency balances so FX revaluation can compute real gains/
    // losses. All columns are nullable and unused by SAR accounts (zero impact on
    // the existing SAR flow).
    `ALTER TABLE bank_accounts     ADD COLUMN IF NOT EXISTS fx_balance_minor BIGINT`,
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS currency        TEXT`,
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS fx_amount_minor BIGINT`,
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS fx_rate         INTEGER`,

    // ── 2026-06 — Referential-integrity hardening (FK constraints) ────────────
    // Add foreign keys to the previously-loose TEXT id links. Each is added as
    // NOT VALID: it is ENFORCED for all new INSERT/UPDATE (no new orphans can be
    // created and ON DELETE SET NULL applies), but existing legacy rows are NOT
    // scanned/validated — so this is safe and fast even if old orphans exist and
    // can never fail the boot. Each block is idempotent (checks pg_constraint and
    // that the column exists first). A later `VALIDATE CONSTRAINT` can be run
    // manually after any cleanup, if desired.
    ...([
      ['fk_invoices_original_invoice',     'invoices',          'original_invoice_id',     'invoices',        'id'],
      ['fk_invoices_journal_entry',        'invoices',          'journal_entry_id',        'journal_entries', 'id'],
      ['fk_payments_journal_entry',        'payments',          'journal_entry_id',        'journal_entries', 'id'],
      ['fk_bookings_journal_entry',        'bookings',          'journal_entry_id',        'journal_entries', 'id'],
      ['fk_supplier_payments_supplier',    'supplier_payments', 'supplier_id',             'suppliers',       'id'],
      ['fk_supplier_payments_journal',     'supplier_payments', 'journal_entry_id',        'journal_entries', 'id'],
      ['fk_receipt_vouchers_journal',      'receipt_vouchers',  'journal_entry_id',        'journal_entries', 'id'],
      ['fk_quotes_converted_booking',      'quotes',            'converted_to_booking_id', 'bookings',        'id'],
    ] as const).map(([name, child, col, parent, pcol]) => `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${child}' AND column_name='${col}')
           AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${name}') THEN
          ALTER TABLE ${child}
            ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES ${parent}(${pcol}) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$`),
  ];

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    let failed = 0;
    for (const stmt of migrations) {
      try {
        await sql.query(stmt);
      } catch (stmtErr) {
        failed++;
        // Log individual failures but continue — a failed idempotent migration
        // should not prevent subsequent migrations from running.
        console.error(JSON.stringify({ event: 'db_migration_stmt_failed', error: String(stmtErr), stmt: stmt.slice(0, 80) }));
      }
    }
    console.log(JSON.stringify({ event: 'db_migrations_applied', total: migrations.length, failed }));
  } catch (err) {
    console.error(JSON.stringify({ event: 'db_migrations_failed', error: String(err) }));
  }

  if (process.env.SENTRY_DSN) {
    const { init } = await import('@sentry/nextjs');
    init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
}
