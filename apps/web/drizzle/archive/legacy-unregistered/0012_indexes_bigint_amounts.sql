-- Migration 0012: Performance indexes + widen monetary columns to bigint
--
-- Part A — Performance indexes on multi-tenant financial tables.
--   These accelerate the agency-scoped queries that power reports, the GL,
--   and list views. All are created IF NOT EXISTS so the migration is
--   idempotent and safe to re-run.
--
-- Part B — Widen every "*_halalas" monetary column from integer (max ~21M SAR)
--   to bigint. Saudi travel agencies handle Hajj/Umrah group invoices and BSP
--   remittances that can exceed the 32-bit signed limit. ALTER ... TYPE bigint
--   is a metadata-only change in PostgreSQL when widening integer→bigint and
--   does not rewrite the table.

-- ── Part A: indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_invoices_agency"          ON "invoices" ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_agency_status"   ON "invoices" ("agency_id","status");
CREATE INDEX IF NOT EXISTS "idx_invoices_agency_created"  ON "invoices" ("agency_id","created_at");
-- One invoice per booking per agency (NULL booking_id rows remain unconstrained)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoices_agency_booking" ON "invoices" ("agency_id","booking_id");

CREATE INDEX IF NOT EXISTS "idx_je_agency"         ON "journal_entries" ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_je_agency_date"    ON "journal_entries" ("agency_id","date");
CREATE INDEX IF NOT EXISTS "idx_je_agency_source"  ON "journal_entries" ("agency_id","source");

CREATE INDEX IF NOT EXISTS "idx_jl_agency"          ON "journal_lines" ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_jl_agency_account"  ON "journal_lines" ("agency_id","account_code");
CREATE INDEX IF NOT EXISTS "idx_jl_entry"           ON "journal_lines" ("entry_id");

CREATE INDEX IF NOT EXISTS "idx_bookings_agency"         ON "bookings" ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_bookings_agency_status"  ON "bookings" ("agency_id","status");

CREATE INDEX IF NOT EXISTS "idx_payments_agency"  ON "payments" ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_payments_booking" ON "payments" ("booking_id");

CREATE INDEX IF NOT EXISTS "idx_customers_agency" ON "customers" ("agency_id");
CREATE INDEX IF NOT EXISTS "idx_suppliers_agency" ON "suppliers" ("agency_id");

-- ── Part B: widen monetary columns to bigint ────────────────────────────────
ALTER TABLE "invoices"
  ALTER COLUMN "subtotal_halalas" TYPE bigint,
  ALTER COLUMN "vat_halalas"      TYPE bigint,
  ALTER COLUMN "total_halalas"    TYPE bigint,
  ALTER COLUMN "paid_halalas"     TYPE bigint;

ALTER TABLE "journal_entries"
  ALTER COLUMN "total_debit_halalas"  TYPE bigint,
  ALTER COLUMN "total_credit_halalas" TYPE bigint;

ALTER TABLE "journal_lines"
  ALTER COLUMN "debit_halalas"  TYPE bigint,
  ALTER COLUMN "credit_halalas" TYPE bigint;

ALTER TABLE "chart_of_accounts"
  ALTER COLUMN "opening_balance_halalas" TYPE bigint;

ALTER TABLE "bookings"
  ALTER COLUMN "total_price_halalas" TYPE bigint,
  ALTER COLUMN "cost_price_halalas"  TYPE bigint,
  ALTER COLUMN "profit_halalas"      TYPE bigint,
  ALTER COLUMN "paid_halalas"        TYPE bigint;

ALTER TABLE "payments"          ALTER COLUMN "amount_halalas" TYPE bigint;
ALTER TABLE "receipt_vouchers"  ALTER COLUMN "amount_halalas" TYPE bigint;
ALTER TABLE "supplier_payments" ALTER COLUMN "amount_halalas" TYPE bigint;

ALTER TABLE "customers"
  ALTER COLUMN "credit_limit_halalas"    TYPE bigint,
  ALTER COLUMN "opening_balance_halalas" TYPE bigint;

ALTER TABLE "suppliers" ALTER COLUMN "balance_halalas" TYPE bigint;

ALTER TABLE "recurring_invoices"
  ALTER COLUMN "subtotal_halalas" TYPE bigint,
  ALTER COLUMN "vat_halalas"      TYPE bigint,
  ALTER COLUMN "total_halalas"    TYPE bigint;

ALTER TABLE "bsp_billings"
  ALTER COLUMN "total_sales_halalas"      TYPE bigint,
  ALTER COLUMN "total_refunds_halalas"    TYPE bigint,
  ALTER COLUMN "total_commission_halalas" TYPE bigint,
  ALTER COLUMN "net_remit_halalas"        TYPE bigint;

ALTER TABLE "bsp_adjustments" ALTER COLUMN "amount_halalas" TYPE bigint;

ALTER TABLE "bank_accounts"
  ALTER COLUMN "opening_balance_halalas"    TYPE bigint,
  ALTER COLUMN "current_balance_halalas"    TYPE bigint,
  ALTER COLUMN "reconciled_balance_halalas" TYPE bigint;

ALTER TABLE "bank_transactions"
  ALTER COLUMN "amount_halalas"        TYPE bigint,
  ALTER COLUMN "balance_after_halalas" TYPE bigint;

ALTER TABLE "cheques" ALTER COLUMN "amount_halalas" TYPE bigint;

ALTER TABLE "pnr_records"
  ALTER COLUMN "fare_halalas"  TYPE bigint,
  ALTER COLUMN "tax_halalas"   TYPE bigint,
  ALTER COLUMN "total_halalas" TYPE bigint;

ALTER TABLE "tickets"
  ALTER COLUMN "fare_halalas"  TYPE bigint,
  ALTER COLUMN "tax_halalas"   TYPE bigint,
  ALTER COLUMN "total_halalas" TYPE bigint;

ALTER TABLE "quotes" ALTER COLUMN "total_halalas" TYPE bigint;

ALTER TABLE "employees" ALTER COLUMN "salary_halalas" TYPE bigint;

ALTER TABLE "employee_contracts"
  ALTER COLUMN "base_salary_halalas"          TYPE bigint,
  ALTER COLUMN "housing_allowance_halalas"    TYPE bigint,
  ALTER COLUMN "transport_allowance_halalas"  TYPE bigint,
  ALTER COLUMN "other_allowances_halalas"     TYPE bigint;

ALTER TABLE "payslips"
  ALTER COLUMN "base_salary_halalas"         TYPE bigint,
  ALTER COLUMN "housing_allowance_halalas"   TYPE bigint,
  ALTER COLUMN "transport_allowance_halalas" TYPE bigint,
  ALTER COLUMN "other_allowances_halalas"    TYPE bigint,
  ALTER COLUMN "gross_halalas"               TYPE bigint,
  ALTER COLUMN "deductions_halalas"          TYPE bigint,
  ALTER COLUMN "advance_deduction_halalas"   TYPE bigint,
  ALTER COLUMN "gosi_employee_halalas"       TYPE bigint,
  ALTER COLUMN "gosi_employer_halalas"       TYPE bigint,
  ALTER COLUMN "net_halalas"                 TYPE bigint;

ALTER TABLE "salary_advances" ALTER COLUMN "amount_halalas" TYPE bigint;
ALTER TABLE "salary_payments" ALTER COLUMN "amount_halalas" TYPE bigint;
ALTER TABLE "eosb_accruals"   ALTER COLUMN "amount_halalas" TYPE bigint;
