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
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_invoice_id TEXT REFERENCES invoices(id)`,

    // quotes: conversion tracking
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS converted_to_booking_id TEXT`,
    `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ`,

    // ── 2026-06 — ZATCA Phase 2 columns ──────────────────────────────────────
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
  ];

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    for (const stmt of migrations) {
      await sql.query(stmt);
    }
    console.log(JSON.stringify({ event: 'db_migrations_applied', count: migrations.length }));
  } catch (err) {
    // Log but don't crash the server — a failed migration is investigated,
    // not a reason to take the whole app down.
    console.error(JSON.stringify({ event: 'db_migrations_failed', error: String(err) }));
  }

  if (process.env.SENTRY_DSN) {
    const { init } = await import('@sentry/nextjs');
    init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
}
