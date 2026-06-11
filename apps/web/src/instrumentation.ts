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

    // ── 2026-06 — Remove NOT VALID FK constraints (rollback of c117da9) ─────────
    // NOT VALID still enforces FKs on new INSERTs. Every route inserts the child
    // row (invoices / payments / bookings) with journalEntryId set BEFORE the
    // journal_entries parent row is inserted — causing FK violations on all
    // invoice / payment creation. Dropping restores the working behaviour;
    // application-level transactions preserve integrity without DB-level FKs.
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_original_invoice')  THEN ALTER TABLE invoices          DROP CONSTRAINT fk_invoices_original_invoice;  END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_journal_entry')     THEN ALTER TABLE invoices          DROP CONSTRAINT fk_invoices_journal_entry;     END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payments_journal_entry')     THEN ALTER TABLE payments          DROP CONSTRAINT fk_payments_journal_entry;     END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_bookings_journal_entry')     THEN ALTER TABLE bookings          DROP CONSTRAINT fk_bookings_journal_entry;     END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_supplier_payments_supplier') THEN ALTER TABLE supplier_payments DROP CONSTRAINT fk_supplier_payments_supplier; END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_supplier_payments_journal')  THEN ALTER TABLE supplier_payments DROP CONSTRAINT fk_supplier_payments_journal;  END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_receipt_vouchers_journal')   THEN ALTER TABLE receipt_vouchers  DROP CONSTRAINT fk_receipt_vouchers_journal;   END IF; END $$`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_quotes_converted_booking')   THEN ALTER TABLE quotes            DROP CONSTRAINT fk_quotes_converted_booking;   END IF; END $$`,

    // ── 2026-06 — Re-add FK constraints as DEFERRABLE INITIALLY DEFERRED ─────
    // PostgreSQL deferred constraints are checked at COMMIT time rather than at
    // each individual statement. This is compatible with the application's
    // child-before-parent insert pattern (child row with journalEntryId is
    // inserted first, parent journal_entries row is inserted second — both
    // within the same transaction, so the FK check at COMMIT finds both rows).
    // New names (_deferred suffix) avoid conflict with the non-deferred versions
    // dropped above, making these ADD statements idempotent on repeat startups.
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_original_invoice_deferred') THEN ALTER TABLE invoices ADD CONSTRAINT fk_invoices_original_invoice_deferred FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_journal_entry_deferred')    THEN ALTER TABLE invoices ADD CONSTRAINT fk_invoices_journal_entry_deferred    FOREIGN KEY (journal_entry_id)    REFERENCES journal_entries(id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payments_journal_entry_deferred')    THEN ALTER TABLE payments ADD CONSTRAINT fk_payments_journal_entry_deferred    FOREIGN KEY (journal_entry_id)    REFERENCES journal_entries(id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_bookings_journal_entry_deferred')    THEN ALTER TABLE bookings ADD CONSTRAINT fk_bookings_journal_entry_deferred    FOREIGN KEY (journal_entry_id)    REFERENCES journal_entries(id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_supplier_payments_supplier_deferred') THEN ALTER TABLE supplier_payments ADD CONSTRAINT fk_supplier_payments_supplier_deferred FOREIGN KEY (supplier_id)       REFERENCES suppliers(id)       DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_supplier_payments_journal_deferred') THEN ALTER TABLE supplier_payments ADD CONSTRAINT fk_supplier_payments_journal_deferred  FOREIGN KEY (journal_entry_id)    REFERENCES journal_entries(id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_receipt_vouchers_journal_deferred')  THEN ALTER TABLE receipt_vouchers  ADD CONSTRAINT fk_receipt_vouchers_journal_deferred  FOREIGN KEY (journal_entry_id)    REFERENCES journal_entries(id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_quotes_converted_booking_deferred')  THEN ALTER TABLE quotes            ADD CONSTRAINT fk_quotes_converted_booking_deferred  FOREIGN KEY (converted_to_booking_id) REFERENCES bookings(id)        DEFERRABLE INITIALLY DEFERRED; END IF; END $$`,

    // ── 2026-06-08 — Add nationality_type to employees (GOSI rate classification) ──
    // Saudi employees: 9.75% employer GOSI. Expats: 2% employer GOSI.
    // Default 'saudi' so existing rows are not affected.
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='nationality_type') THEN ALTER TABLE employees ADD COLUMN nationality_type TEXT NOT NULL DEFAULT 'saudi'; END IF; END $$`,

    // ── 2026-06-08 — Widen vat_returns monetary columns from INTEGER to BIGINT ──
    // INTEGER caps at ~21.47M SAR per quarter. Agencies above that threshold
    // would silently overflow the VAT return amounts. BIGINT has no practical limit.
    // This is a safe widening migration — no data loss, no default changes.
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vat_returns' AND column_name='output_vat_halalas' AND data_type='integer') THEN ALTER TABLE vat_returns ALTER COLUMN output_vat_halalas TYPE bigint, ALTER COLUMN input_vat_halalas TYPE bigint, ALTER COLUMN net_vat_halalas TYPE bigint; END IF; END $$`,

    // ── 2026-06-09 — Structured per-passenger table ───────────────────────────
    // Normalises the ad-hoc passengers array from bookings.details (JSONB) into
    // queryable, indexed rows — enabling passenger manifests, passport-expiry
    // warnings, and repeat-customer document lookup without JSON extraction.
    `DO $$ BEGIN
       CREATE TABLE IF NOT EXISTS booking_passengers (
         id               TEXT PRIMARY KEY,
         agency_id        TEXT NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
         booking_id       TEXT NOT NULL REFERENCES bookings(id)  ON DELETE CASCADE,
         name_ar          TEXT NOT NULL,
         name_en          TEXT,
         type             TEXT NOT NULL DEFAULT 'ADT',
         gender           TEXT,
         passport_number  TEXT,
         passport_expiry  TEXT,
         nationality      TEXT,
         date_of_birth    TEXT,
         national_id      TEXT,
         notes            TEXT,
         created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         created_by       TEXT
       );
       CREATE INDEX IF NOT EXISTS idx_bp_agency_booking ON booking_passengers(agency_id, booking_id);
       CREATE INDEX IF NOT EXISTS idx_bp_passport ON booking_passengers(agency_id, passport_number)
         WHERE passport_number IS NOT NULL;
     END $$`,

    // ── 2026-06-08 — Create booking_lines table ──────────────────────────────
    // Source of Truth for per-service VAT, cost, revenue model, and GL mapping.
    // Replaces the single aggregated VAT on bookings/invoices with per-line
    // breakdown, enabling mixed-supply VAT (e.g. 0% flight + 15% hotel in one
    // booking) and correct ZATCA line-item generation.
    `DO $$ BEGIN
       CREATE TABLE IF NOT EXISTS booking_lines (
         id                           TEXT PRIMARY KEY,
         booking_id                   TEXT NOT NULL REFERENCES bookings(id)  ON DELETE CASCADE,
         agency_id                    TEXT NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
         service_type                 TEXT NOT NULL,
         description                  TEXT NOT NULL,
         supplier_id                  TEXT,
         supplier_name                TEXT,
         quantity                     INTEGER NOT NULL DEFAULT 1,
         unit_cost_halalas            BIGINT  NOT NULL DEFAULT 0,
         total_cost_halalas           BIGINT  NOT NULL DEFAULT 0,
         unit_price_excl_vat_halalas  BIGINT  NOT NULL DEFAULT 0,
         total_price_excl_vat_halalas BIGINT  NOT NULL DEFAULT 0,
         vat_category                 TEXT    NOT NULL DEFAULT 'S',
         vat_rate_bps                 INTEGER NOT NULL DEFAULT 1500,
         vat_halalas                  BIGINT  NOT NULL DEFAULT 0,
         revenue_model                TEXT    NOT NULL DEFAULT 'agent',
         revenue_account_code         TEXT,
         cost_account_code            TEXT,
         operational_status           TEXT    NOT NULL DEFAULT 'pending',
         pnr_reference                TEXT,
         voucher_number               TEXT,
         is_legacy                    BOOLEAN NOT NULL DEFAULT FALSE,
         status                       TEXT    NOT NULL DEFAULT 'active',
         cancelled_at                 TIMESTAMP,
         refund_halalas               BIGINT  NOT NULL DEFAULT 0,
         sort_order                   INTEGER NOT NULL DEFAULT 0,
         notes                        TEXT,
         created_at                   TIMESTAMP NOT NULL DEFAULT NOW(),
         updated_at                   TIMESTAMP NOT NULL DEFAULT NOW()
       );
       CREATE INDEX IF NOT EXISTS idx_bl_booking        ON booking_lines(booking_id);
       CREATE INDEX IF NOT EXISTS idx_bl_agency         ON booking_lines(agency_id);
       CREATE INDEX IF NOT EXISTS idx_bl_agency_service ON booking_lines(agency_id, service_type);
       CREATE INDEX IF NOT EXISTS idx_bl_status         ON booking_lines(agency_id, status);
     END $$`,

    // ── 2026-06-08 — Backfill legacy booking_lines for existing bookings ─────
    // Each pre-existing booking receives one is_legacy=true line holding the
    // aggregated totals. These lines are immutable and excluded from per-line
    // VAT/GL reports via the is_legacy flag.
    // unit_price_excl_vat_halalas stores total_price_halalas (VAT-inclusive) as
    // an approximation — acceptable because is_legacy=true signals "don't trust
    // per-line VAT breakdown for this historical record".
    `INSERT INTO booking_lines (
       id, booking_id, agency_id, service_type, description,
       unit_cost_halalas, total_cost_halalas,
       unit_price_excl_vat_halalas, total_price_excl_vat_halalas,
       vat_category, vat_rate_bps, vat_halalas,
       revenue_model, is_legacy, status, sort_order,
       created_at, updated_at
     )
     SELECT
       'legacy-' || b.id,
       b.id,
       b.agency_id,
       COALESCE(b.service_type, 'custom'),
       COALESCE(b.service_type, 'custom'),
       COALESCE(b.cost_price_halalas, 0),
       COALESCE(b.cost_price_halalas, 0),
       COALESCE(b.total_price_halalas, 0),
       COALESCE(b.total_price_halalas, 0),
       'S', 0, 0,
       COALESCE(b.details->>'revenueModel', 'agent'),
       TRUE,
       CASE WHEN b.status = 'cancelled' THEN 'cancelled' ELSE 'active' END,
       1,
       b.created_at,
       b.updated_at
     FROM bookings b
     WHERE NOT EXISTS (SELECT 1 FROM booking_lines bl WHERE bl.booking_id = b.id)`,

    // ── 2026-06-09 — Payment plan & installments tables ──────────────────────
    `DO $$ BEGIN
       CREATE TABLE IF NOT EXISTS payment_plans (
         id                   TEXT PRIMARY KEY,
         agency_id            TEXT NOT NULL,
         booking_id           TEXT NOT NULL,
         invoice_id           TEXT NOT NULL,
         total_amount_halalas BIGINT NOT NULL,
         num_installments     INTEGER NOT NULL,
         notes                TEXT,
         status               TEXT NOT NULL DEFAULT 'active',
         created_by           TEXT,
         created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE INDEX IF NOT EXISTS idx_pp_agency  ON payment_plans(agency_id);
       CREATE INDEX IF NOT EXISTS idx_pp_booking ON payment_plans(agency_id, booking_id);

       CREATE TABLE IF NOT EXISTS payment_plan_installments (
         id                   TEXT PRIMARY KEY,
         agency_id            TEXT NOT NULL,
         plan_id              TEXT NOT NULL,
         booking_id           TEXT NOT NULL,
         invoice_id           TEXT NOT NULL,
         installment_number   INTEGER NOT NULL,
         due_date             TEXT NOT NULL,
         amount_halalas       BIGINT NOT NULL,
         status               TEXT NOT NULL DEFAULT 'pending',
         paid_at              TIMESTAMPTZ,
         payment_id           TEXT,
         notes                TEXT,
         created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE INDEX IF NOT EXISTS idx_ppi_plan   ON payment_plan_installments(plan_id);
       CREATE INDEX IF NOT EXISTS idx_ppi_agency ON payment_plan_installments(agency_id, status);
       CREATE INDEX IF NOT EXISTS idx_ppi_due    ON payment_plan_installments(agency_id, due_date);
     END $$`,

    // ── 2026-06-09 — Group trips & members (Umrah/Hajj group management) ──────
    `DO $$ BEGIN
       CREATE TABLE IF NOT EXISTS group_trips (
         id                       TEXT PRIMARY KEY,
         agency_id                TEXT NOT NULL,
         name                     TEXT NOT NULL,
         service_type             TEXT NOT NULL DEFAULT 'umrah',
         departure_date           TEXT,
         return_date              TEXT,
         capacity                 INTEGER,
         price_per_person_halalas BIGINT NOT NULL DEFAULT 0,
         status                   TEXT NOT NULL DEFAULT 'planning',
         notes                    TEXT,
         created_by               TEXT,
         created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE INDEX IF NOT EXISTS idx_gt_agency        ON group_trips(agency_id);
       CREATE INDEX IF NOT EXISTS idx_gt_agency_status ON group_trips(agency_id, status);

       CREATE TABLE IF NOT EXISTS group_trip_members (
         id               TEXT PRIMARY KEY,
         agency_id        TEXT NOT NULL,
         group_trip_id    TEXT NOT NULL,
         name_ar          TEXT NOT NULL,
         name_en          TEXT,
         phone            TEXT,
         passport_number  TEXT,
         passport_expiry  TEXT,
         nationality      TEXT,
         visa_status      TEXT NOT NULL DEFAULT 'pending',
         visa_number      TEXT,
         visa_expiry      TEXT,
         room_type        TEXT,
         notes            TEXT,
         status           TEXT NOT NULL DEFAULT 'registered',
         created_by       TEXT,
         created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE INDEX IF NOT EXISTS idx_gtm_group  ON group_trip_members(group_trip_id);
       CREATE INDEX IF NOT EXISTS idx_gtm_agency ON group_trip_members(agency_id, group_trip_id);
     END $$`,

    // ── 2026-06-09 — Customer messages outbound communication log ───────────
    `DO $$ BEGIN
       CREATE TABLE IF NOT EXISTS customer_messages (
         id               TEXT PRIMARY KEY,
         agency_id        TEXT NOT NULL,
         booking_id       TEXT,
         recipient_name   TEXT NOT NULL,
         recipient_phone  TEXT,
         channel          TEXT NOT NULL,
         template_key     TEXT,
         message_ar       TEXT NOT NULL,
         message_en       TEXT,
         sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         sent_by          TEXT,
         created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       CREATE INDEX IF NOT EXISTS idx_cm_agency_booking ON customer_messages(agency_id, booking_id);
       CREATE INDEX IF NOT EXISTS idx_cm_agency_time    ON customer_messages(agency_id, sent_at DESC);
     END $$`,

  // ── 2026-06-09 — Document attachments (Vercel Blob) ─────────────────────
  `DO $$ BEGIN
     CREATE TABLE IF NOT EXISTS documents (
       id           TEXT PRIMARY KEY,
       agency_id    TEXT NOT NULL,
       entity_type  TEXT NOT NULL,
       entity_id    TEXT NOT NULL,
       file_name    TEXT NOT NULL,
       file_url     TEXT NOT NULL,
       file_size    INTEGER,
       mime_type    TEXT,
       uploaded_by  TEXT,
       created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );
     CREATE INDEX IF NOT EXISTS idx_docs_entity      ON documents(agency_id, entity_type, entity_id);
     CREATE INDEX IF NOT EXISTS idx_docs_agency_time ON documents(agency_id, created_at DESC);
   END $$`,

    // ── 2026-06-09 — Configurable GOSI rates per agency ─────────────────────
    // Saudi 2024 social insurance reform: employer 12% (9%+2%+1%), employee 10% (9%+1%), expat 2%.
    // Stored as basis points × 100 (1200 = 12.00%) so integer arithmetic can represent fractions.
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS gosi_employer_rate_saudi INTEGER NOT NULL DEFAULT 1200`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS gosi_employee_rate_saudi INTEGER NOT NULL DEFAULT 1000`,
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS gosi_employer_rate_expat  INTEGER NOT NULL DEFAULT 200`,

    // ── 2026-06-09 — Payroll uniqueness guards (prevent double-posting race) ──
    // At most one payslip and one salary-payment per employee per month. Without
    // these, two concurrent "Mark Paid" requests could double-book salary expense
    // / disbursement. Idempotent; if pre-existing duplicate rows exist the index
    // creation fails and is logged, leaving the table unchanged (no startup crash).
    `CREATE UNIQUE INDEX IF NOT EXISTS payslips_agency_emp_month_uq
      ON payslips(agency_id, employee_id, month)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS salary_payments_agency_emp_month_uq
      ON salary_payments(agency_id, employee_id, month)`,

    // ── 2026-06-10 — ZATCA Phase 2 per-invoice submission tracking ───────────
    // Mirrors drizzle/0018_zatca_invoice_submission.sql.
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_status       TEXT NOT NULL DEFAULT 'not_submitted'`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_icv          BIGINT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_pih          TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_qr           TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_signed_xml   TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_submitted_at TIMESTAMPTZ`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS zatca_response     JSONB`,
    // ICV is monotonically increasing per agency (invoice numbers reset yearly; ICV never resets)
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zatca_invoice_counter BIGINT NOT NULL DEFAULT 0`,

    // ── 2026-06-11 — Fix booking↔invoice uniqueness (unblocks refunds) ───────
    // The previous unfiltered unique index uq_invoices_agency_booking made EVERY
    // booking-linked credit note (type 381, refunds) and debit note (383) collide
    // (23505) with the original invoice, so refunds could never post. Replace it
    // with a PARTIAL unique index that constrains only ORIGINAL invoices
    // (type 380 legacy / 388 simplified) — credit/debit notes are excluded and
    // may freely reference the same booking_id. Drop the stale type='380'-only
    // partial index too; the app issues type '388', so it never matched.
    `DROP INDEX IF EXISTS uq_invoices_agency_booking`,
    `DROP INDEX IF EXISTS invoices_one_per_booking`,
    `CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_booking
       ON invoices(agency_id, booking_id)
       WHERE type IN ('380','388') AND booking_id IS NOT NULL`,

    // ── 2026-06-11 — Prevent concurrent double ticket issuance (HIGH-3) ──────
    // At most one in-flight (active/pending) ticket per passenger per PNR.
    // Without this the non-atomic SELECT-then-INSERT let two concurrent requests
    // both pass the duplicate check and both call the GDS → two BSP tickets.
    `CREATE UNIQUE INDEX IF NOT EXISTS tickets_active_passenger_uq
       ON tickets(agency_id, pnr_id, passenger_name)
       WHERE status IN ('active','pending')`,

    // ── 2026-06-11 — DB integrity & performance hardening ────────────────────
    // Counter sequence overflow guard: widen to bigint (MED-12).
    `ALTER TABLE agency_counters ALTER COLUMN current_value TYPE BIGINT`,
    // Referential integrity on journal lines: agency_id must reference a real
    // agency (MED-4). Guarded so a pre-existing constraint or orphan rows can't
    // crash startup.
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_journal_lines_agency') THEN
         ALTER TABLE journal_lines
           ADD CONSTRAINT fk_journal_lines_agency
           FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
       END IF;
     END $$`,
    // PNR indexes: the hourly expire-cron and per-agency PNR list were full
    // table scans (B1 / MED-16).
    `CREATE INDEX IF NOT EXISTS idx_pnr_expiry         ON pnr_records(status, expires_at) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_pnr_agency_created ON pnr_records(agency_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_pnr_agency_status  ON pnr_records(agency_id, status)`,

    // ── 2026-06-11 — Provider sync log (A6) ─────────────────────────────────
    // Queryable audit trail of GDS/provider operations for financial reconciliation.
    `CREATE TABLE IF NOT EXISTS provider_sync_log (
       id            TEXT PRIMARY KEY,
       agency_id     TEXT NOT NULL,
       provider      TEXT NOT NULL,
       operation     TEXT NOT NULL,
       status        TEXT NOT NULL,
       reference_id  TEXT,
       error_message TEXT,
       duration_ms   BIGINT,
       created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_psl_agency_time     ON provider_sync_log(agency_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_psl_agency_provider ON provider_sync_log(agency_id, provider, operation)`,

    // ── 2026-06-11 — Journal line non-negativity CHECK (MED-5) ──────────────
    // A journal line's debit and credit must never be negative (negatives are
    // expressed as the opposite side). NOT VALID applies to new rows without
    // scanning history, so it can't fail startup on legacy data.
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='journal_lines_nonneg_chk') THEN
         ALTER TABLE journal_lines
           ADD CONSTRAINT journal_lines_nonneg_chk
           CHECK (debit_halalas >= 0 AND credit_halalas >= 0) NOT VALID;
       END IF;
     END $$`,

    // ── 2026-06-11 — Rounding-difference account for every agency (MED-10) ──
    // Backfills 8399 so manual-journal rounding remainders have a dedicated home
    // instead of inflating a real line. Idempotent via the (agency_id, code) uq.
    `INSERT INTO chart_of_accounts (id, agency_id, code, name_ar, name_en, type, is_system, allow_direct_entry, level)
       SELECT a.id || '-coa-8399', a.id, '8399', 'فروق التقريب', 'Rounding Differences', 'expense', true, true, 1
       FROM agencies a
       ON CONFLICT (agency_id, code) DO NOTHING`,

    // ── 2026-06-11 — FX revaluation idempotency (HIGH-7) ────────────────────
    // One revaluation entry per (agency, account, date) so two concurrent runs
    // for the same date cannot both post. Partial index scoped to the
    // fx_revaluation source only — monthly revaluations on other dates are fine.
    `CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_fx_reval_uq
       ON journal_entries(agency_id, source_id, date)
       WHERE source = 'fx_revaluation'`,
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
