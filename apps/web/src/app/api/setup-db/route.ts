/**
 * One-time database setup endpoint.
 * Creates all Postgres tables using CREATE TABLE IF NOT EXISTS (safe to re-run).
 *
 * Auth: either x-setup-secret header OR a valid Firebase admin/owner JWT.
 */
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const CREATE_TABLES_SQL = `

-- ══ AGENCIES ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agencies (
  id                   TEXT PRIMARY KEY,
  name_ar              TEXT NOT NULL,
  name_en              TEXT,
  email                TEXT,
  phone                TEXT,
  address_ar           TEXT,
  address_en           TEXT,
  city                 TEXT,
  country              TEXT DEFAULT 'SA',
  vat_number           TEXT,
  cr_number            TEXT,
  logo_url             TEXT,
  plan                 TEXT NOT NULL DEFAULT 'trial',
  subscription_status  TEXT NOT NULL DEFAULT 'trial',
  trial_end_date       TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  contact_email        TEXT,
  contact_phone        TEXT,
  contact_hours        TEXT,
  default_currency     TEXT DEFAULT 'SAR',
  is_vat_registered    BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate             INTEGER NOT NULL DEFAULT 15,
  smtp_host            TEXT,
  smtp_port            INTEGER,
  smtp_user            TEXT,
  smtp_password        TEXT,
  smtp_from_name       TEXT,
  smtp_from_email      TEXT,
  smtp_encryption      TEXT DEFAULT 'tls',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══ USERS ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name_ar     TEXT,
  name_en     TEXT,
  role        TEXT NOT NULL DEFAULT 'staff',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);

-- ══ SERVICE TYPES ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS service_types (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'layers',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_types_agency ON service_types(agency_id);

-- ══ CUSTOMERS ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS customers (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name_ar          TEXT NOT NULL,
  name_en          TEXT,
  phone            TEXT,
  email            TEXT,
  passport_number  TEXT,
  national_id      TEXT,
  nationality      TEXT,
  date_of_birth    TEXT,
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_agency ON customers(agency_id);

-- ══ SUPPLIERS ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS suppliers (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name_ar          TEXT NOT NULL,
  name_en          TEXT,
  type             TEXT,
  phone            TEXT,
  email            TEXT,
  account_number   TEXT,
  vat_number       TEXT,
  balance_halalas  INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_agency ON suppliers(agency_id);

-- ══ BOOKINGS ═════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bookings (
  id                   TEXT PRIMARY KEY,
  agency_id            TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  booking_number       TEXT NOT NULL,
  service_type         TEXT NOT NULL,
  custom_type_id       TEXT,
  custom_type_name     TEXT,
  customer_id          TEXT REFERENCES customers(id),
  customer_name_ar     TEXT,
  customer_name_en     TEXT,
  customer_phone       TEXT,
  status               TEXT NOT NULL DEFAULT 'confirmed',
  total_price_halalas  INTEGER NOT NULL DEFAULT 0,
  cost_price_halalas   INTEGER NOT NULL DEFAULT 0,
  profit_halalas       INTEGER NOT NULL DEFAULT 0,
  paid_halalas         INTEGER NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'SAR',
  notes                TEXT,
  details              JSONB,
  journal_entry_id     TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_agency    ON bookings(agency_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer  ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created   ON bookings(agency_id, created_at DESC);

-- ══ QUOTES ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT PRIMARY KEY,
  agency_id       TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  quote_number    TEXT NOT NULL,
  customer_id     TEXT REFERENCES customers(id),
  customer_name   TEXT,
  customer_phone  TEXT,
  items           JSONB,
  total_halalas   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  valid_until     TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotes_agency ON quotes(agency_id);

-- ══ INVOICES ═════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoices (
  id                 TEXT PRIMARY KEY,
  agency_id          TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  invoice_number     TEXT NOT NULL,
  type               TEXT NOT NULL DEFAULT '380',
  booking_id         TEXT REFERENCES bookings(id),
  customer_id        TEXT REFERENCES customers(id),
  seller_name_ar     TEXT,
  seller_name_en     TEXT,
  seller_vat_number  TEXT,
  seller_cr_number   TEXT,
  seller_address     TEXT,
  buyer_name_ar      TEXT,
  buyer_name_en      TEXT,
  buyer_phone        TEXT,
  buyer_email        TEXT,
  buyer_national_id  TEXT,
  subtotal_halalas   INTEGER NOT NULL DEFAULT 0,
  vat_halalas        INTEGER NOT NULL DEFAULT 0,
  total_halalas      INTEGER NOT NULL DEFAULT 0,
  paid_halalas       INTEGER NOT NULL DEFAULT 0,
  issue_date         TEXT NOT NULL,
  supply_date        TEXT,
  due_date           TEXT,
  status             TEXT NOT NULL DEFAULT 'issued',
  payment_method     TEXT,
  payment_ref        TEXT,
  zatca_uuid         TEXT,
  zatca_hash         TEXT,
  is_e_invoice       BOOLEAN NOT NULL DEFAULT FALSE,
  items              JSONB,
  notes              TEXT,
  journal_entry_id   TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_agency   ON invoices(agency_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking  ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created  ON invoices(agency_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_booking ON invoices(booking_id, agency_id) WHERE type = '380' AND booking_id IS NOT NULL;

-- ══ PAYMENTS ═════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  invoice_id       TEXT REFERENCES invoices(id),
  booking_id       TEXT REFERENCES bookings(id),
  customer_id      TEXT REFERENCES customers(id),
  customer_name    TEXT,
  amount_halalas   INTEGER NOT NULL,
  method           TEXT NOT NULL,
  reference        TEXT,
  voucher_number   TEXT,
  date             TEXT NOT NULL,
  notes            TEXT,
  journal_entry_id TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_agency  ON payments(agency_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- ══ RECEIPT VOUCHERS ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS receipt_vouchers (
  id                  TEXT PRIMARY KEY,
  agency_id           TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  voucher_number      TEXT NOT NULL,
  customer_id         TEXT REFERENCES customers(id),
  customer_name       TEXT,
  amount_halalas      INTEGER NOT NULL,
  method              TEXT NOT NULL,
  description         TEXT,
  booking_id          TEXT REFERENCES bookings(id),
  invoice_id          TEXT REFERENCES invoices(id),
  date                TEXT NOT NULL,
  journal_entry_id    TEXT,
  is_refund           TEXT DEFAULT 'false',
  original_voucher_id TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_agency ON receipt_vouchers(agency_id);

-- ══ SUPPLIER PAYMENTS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS supplier_payments (
  id                  TEXT PRIMARY KEY,
  agency_id           TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  booking_id          TEXT REFERENCES bookings(id),
  supplier_id         TEXT,
  supplier_name       TEXT,
  payee_name          TEXT,
  amount_halalas      INTEGER NOT NULL,
  method              TEXT NOT NULL,
  reference           TEXT,
  voucher_number      TEXT,
  expense_category    TEXT,
  booking_number      TEXT,
  date                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'completed',
  is_refund           TEXT DEFAULT 'false',
  original_payment_id TEXT,
  journal_entry_id    TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_agency ON supplier_payments(agency_id);

-- ══ CHART OF ACCOUNTS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id                       TEXT PRIMARY KEY,
  agency_id                TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,
  name_ar                  TEXT NOT NULL,
  name_en                  TEXT,
  type                     TEXT NOT NULL,
  sub_type                 TEXT,
  parent_id                TEXT,
  level                    INTEGER NOT NULL DEFAULT 1,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  is_system                BOOLEAN NOT NULL DEFAULT FALSE,
  allow_direct_entry       BOOLEAN NOT NULL DEFAULT TRUE,
  opening_balance_halalas  INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coa_agency ON chart_of_accounts(agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coa_agency_code ON chart_of_accounts(agency_id, code);

-- ══ JOURNAL ENTRIES ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS journal_entries (
  id                    TEXT PRIMARY KEY,
  agency_id             TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  entry_number          TEXT NOT NULL,
  date                  TEXT NOT NULL,
  description_ar        TEXT,
  description_en        TEXT,
  reference             TEXT,
  source                TEXT NOT NULL DEFAULT 'manual',
  source_id             TEXT,
  is_posted             BOOLEAN NOT NULL DEFAULT TRUE,
  total_debit_halalas   INTEGER NOT NULL DEFAULT 0,
  total_credit_halalas  INTEGER NOT NULL DEFAULT 0,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_agency ON journal_entries(agency_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date   ON journal_entries(agency_id, date DESC);

-- ══ JOURNAL LINES ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS journal_lines (
  id              TEXT PRIMARY KEY,
  entry_id        TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  agency_id       TEXT NOT NULL,
  account_code    TEXT NOT NULL,
  account_name_ar TEXT,
  account_name_en TEXT,
  debit_halalas   INTEGER NOT NULL DEFAULT 0,
  credit_halalas  INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry       ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_agency_code ON journal_lines(agency_id, account_code);

-- ══ BANK ACCOUNTS ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                       TEXT PRIMARY KEY,
  agency_id                TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name_ar                  TEXT NOT NULL,
  name_en                  TEXT,
  type                     TEXT NOT NULL,
  account_number           TEXT,
  bank_name                TEXT,
  iban                     TEXT,
  opening_balance_halalas  INTEGER NOT NULL DEFAULT 0,
  current_balance_halalas  INTEGER NOT NULL DEFAULT 0,
  currency                 TEXT NOT NULL DEFAULT 'SAR',
  gl_account_id            TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  is_reconciled            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_agency ON bank_accounts(agency_id);

-- ══ BANK TRANSACTIONS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                       TEXT PRIMARY KEY,
  agency_id                TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  bank_account_id          TEXT NOT NULL REFERENCES bank_accounts(id),
  type                     TEXT NOT NULL,
  amount_halalas           INTEGER NOT NULL,
  balance_after_halalas    INTEGER,
  description              TEXT,
  reference                TEXT,
  source_type              TEXT,
  source_id                TEXT,
  date                     TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON bank_transactions(bank_account_id);

-- ══ CHEQUES ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cheques (
  id                TEXT PRIMARY KEY,
  agency_id         TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  cheque_number     TEXT NOT NULL,
  bank_account_id   TEXT REFERENCES bank_accounts(id),
  bank_name         TEXT,
  amount_halalas    INTEGER NOT NULL,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  issue_date        TEXT,
  due_date          TEXT,
  payer_name        TEXT,
  payee_name        TEXT,
  related_id        TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cheques_agency ON cheques(agency_id);
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES bank_accounts(id);

-- ══ EMPLOYEES ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employees (
  id                   TEXT PRIMARY KEY,
  agency_id            TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_number      TEXT NOT NULL,
  name_ar              TEXT NOT NULL,
  name_en              TEXT,
  department           TEXT,
  position             TEXT,
  hire_date            TEXT,
  end_date             TEXT,
  salary_halalas       INTEGER NOT NULL DEFAULT 0,
  phone                TEXT,
  email                TEXT,
  national_id          TEXT,
  iqama_number         TEXT,
  bank_account_number  TEXT,
  bank_name            TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  gl_account_id        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employees_agency ON employees(agency_id);

-- ══ SALARY PAYMENTS ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS salary_payments (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL REFERENCES employees(id),
  amount_halalas   INTEGER NOT NULL,
  month            TEXT NOT NULL,
  payment_method   TEXT,
  notes            TEXT,
  journal_entry_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT salary_payments_emp_month_uq UNIQUE (agency_id, employee_id, month)
);
CREATE INDEX IF NOT EXISTS idx_salary_payments_agency    ON salary_payments(agency_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee  ON salary_payments(employee_id);

-- ══ LEAVE REQUESTS ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS leave_requests (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id  TEXT NOT NULL REFERENCES employees(id),
  type         TEXT NOT NULL,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  days         INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'pending',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_agency    ON leave_requests(agency_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee  ON leave_requests(employee_id);

-- ══ AGENCY COUNTERS (atomic sequences) ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS agency_counters (
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  counter_type  TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agency_id, counter_type)
);

-- ══ IDEMPOTENCY KEYS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id         TEXT PRIMARY KEY,
  agency_id  TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  result     JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- ══ EXCHANGE RATES ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS exchange_rates (
  id              TEXT PRIMARY KEY,
  agency_id       TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  from_currency   TEXT NOT NULL,
  to_currency     TEXT NOT NULL DEFAULT 'SAR',
  rate            INTEGER NOT NULL,
  effective_date  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_agency ON exchange_rates(agency_id);

-- ══ COST CENTERS ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cost_centers (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name_ar     TEXT NOT NULL,
  name_en     TEXT,
  type        TEXT NOT NULL DEFAULT 'department',
  parent_id   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_agency_code_uq ON cost_centers(agency_id, code);

-- ══ EMPLOYEE CONTRACTS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_contracts (
  id                          TEXT PRIMARY KEY,
  agency_id                   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id                 TEXT NOT NULL REFERENCES employees(id),
  contract_number             TEXT NOT NULL,
  type                        TEXT NOT NULL DEFAULT 'full_time',
  start_date                  TEXT NOT NULL,
  end_date                    TEXT,
  base_salary_halalas         INTEGER NOT NULL DEFAULT 0,
  housing_allowance_halalas   INTEGER NOT NULL DEFAULT 0,
  transport_allowance_halalas INTEGER NOT NULL DEFAULT 0,
  other_allowances_halalas    INTEGER NOT NULL DEFAULT 0,
  salary_components           JSONB,
  working_days_per_week       INTEGER NOT NULL DEFAULT 5,
  working_hours_per_day       INTEGER NOT NULL DEFAULT 8,
  annual_leave_days           INTEGER NOT NULL DEFAULT 21,
  status                      TEXT NOT NULL DEFAULT 'active',
  notes                       TEXT,
  created_by                  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_emp ON employee_contracts(employee_id);

-- ══ PAYSLIPS ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payslips (
  id                           TEXT PRIMARY KEY,
  agency_id                    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id                  TEXT NOT NULL REFERENCES employees(id),
  salary_payment_id            TEXT,
  month                        TEXT NOT NULL,
  base_salary_halalas          INTEGER NOT NULL DEFAULT 0,
  housing_allowance_halalas    INTEGER NOT NULL DEFAULT 0,
  transport_allowance_halalas  INTEGER NOT NULL DEFAULT 0,
  other_allowances_halalas     INTEGER NOT NULL DEFAULT 0,
  gross_halalas                INTEGER NOT NULL DEFAULT 0,
  deductions_halalas           INTEGER NOT NULL DEFAULT 0,
  advance_deduction_halalas    INTEGER NOT NULL DEFAULT 0,
  gosi_employee_halalas        INTEGER NOT NULL DEFAULT 0,
  net_halalas                  INTEGER NOT NULL DEFAULT 0,
  components                   JSONB,
  payment_date                 TEXT,
  payment_method               TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS payslips_emp_month_uq ON payslips(employee_id, month);

-- ══ SALARY ADVANCES ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS salary_advances (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL REFERENCES employees(id),
  amount_halalas   INTEGER NOT NULL,
  request_date     TEXT NOT NULL,
  deduct_from      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  reason           TEXT,
  approved_by      TEXT,
  journal_entry_id TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_advances_emp ON salary_advances(employee_id);

-- ══ PNR RECORDS ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pnr_records (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  pnr_code         TEXT NOT NULL,
  gds              TEXT,
  airline          TEXT,
  flight_numbers   JSONB,
  origin           TEXT,
  destination      TEXT,
  departure_date   TEXT,
  return_date      TEXT,
  passenger_count  INTEGER NOT NULL DEFAULT 1,
  passenger_names  JSONB,
  ticket_numbers   JSONB,
  fare_halalas     INTEGER NOT NULL DEFAULT 0,
  tax_halalas      INTEGER NOT NULL DEFAULT 0,
  total_halalas    INTEGER NOT NULL DEFAULT 0,
  booking_id       TEXT,
  customer_id      TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  notes            TEXT,
  expires_at       TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS pnr_agency_code_uq ON pnr_records(agency_id, pnr_code);
CREATE INDEX IF NOT EXISTS idx_pnr_agency ON pnr_records(agency_id);

-- ══ APPOINTMENTS ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id   TEXT,
  customer_name TEXT,
  assigned_to   TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL DEFAULT 'meeting',
  status        TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  INTEGER,
  location      TEXT,
  notes         TEXT,
  outcome       TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointments_agency ON appointments(agency_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);

-- ══ AUDIT LOG ═════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL,
  user_id     TEXT,
  user_email  TEXT,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  before      JSONB,
  after       JSONB,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_agency ON audit_log(agency_id, created_at DESC);

-- ══ RECURRING INVOICES ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id                TEXT PRIMARY KEY,
  agency_id         TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id       TEXT,
  title             TEXT NOT NULL,
  subtotal_halalas  INTEGER NOT NULL DEFAULT 0,
  vat_halalas       INTEGER NOT NULL DEFAULT 0,
  total_halalas     INTEGER NOT NULL DEFAULT 0,
  items             JSONB,
  notes             TEXT,
  frequency         TEXT NOT NULL DEFAULT 'monthly',
  day_of_month      INTEGER,
  start_date        TEXT NOT NULL,
  end_date          TEXT,
  last_issued_at    TEXT,
  next_issue_at     TEXT,
  total_issued      INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  buyer_name_ar     TEXT,
  payment_method    TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_agency ON recurring_invoices(agency_id);

-- ══ SHIFTS ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shifts (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name_ar      TEXT NOT NULL,
  name_en      TEXT,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  days_of_week JSONB,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shifts_agency ON shifts(agency_id);

-- ══ ATTENDANCE RECORDS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance_records (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL REFERENCES employees(id),
  shift_id         TEXT,
  date             TEXT NOT NULL,
  check_in         TIMESTAMPTZ,
  check_out        TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'present',
  work_minutes     INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_date_uq ON attendance_records(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_agency_date ON attendance_records(agency_id, date);

-- ══ ACCOUNTING PERIODS ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounting_periods (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_periods_agency_ym_uq ON accounting_periods(agency_id, period_year, period_month);

-- ══ AGENCIES: new columns ════════════════════════════════════════════════════
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS default_quote_terms    TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS max_users              INTEGER NOT NULL DEFAULT 5;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS trial_starts_at        TIMESTAMPTZ;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMPTZ;

-- ══ PNR: fix column types (passenger_names / ticket_numbers / flight_numbers were
--    created as JSONB in early setup-db but the app schema expects TEXT)
ALTER TABLE pnr_records ALTER COLUMN passenger_names TYPE TEXT USING passenger_names::text;
ALTER TABLE pnr_records ALTER COLUMN ticket_numbers  TYPE TEXT USING ticket_numbers::text;
ALTER TABLE pnr_records ALTER COLUMN flight_numbers  TYPE TEXT USING flight_numbers::text;

-- ══ PNR: new columns (migration 0011) ════════════════════════════════════════
ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS sync_status  TEXT;
ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS segments     JSONB;
ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS passengers   JSONB;
ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE pnr_records ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;
ALTER TABLE pnr_records ALTER COLUMN expires_at TYPE TIMESTAMPTZ
  USING CASE WHEN expires_at IS NULL THEN NULL ELSE expires_at::text::TIMESTAMPTZ END;

-- ══ TRAVEL EVENTS ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_events (
  id            TEXT        PRIMARY KEY,
  agency_id     TEXT        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  provider      TEXT,
  resource_id   TEXT,
  resource_type TEXT,
  actor_id      TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS travel_events_agency_idx   ON travel_events(agency_id);
CREATE INDEX IF NOT EXISTS travel_events_type_idx     ON travel_events(event_type);
CREATE INDEX IF NOT EXISTS travel_events_provider_idx ON travel_events(provider);
CREATE INDEX IF NOT EXISTS travel_events_resource_idx ON travel_events(resource_id);

-- ══ PROVIDER CREDENTIALS ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS provider_credentials (
  id            TEXT        PRIMARY KEY,
  agency_id     TEXT        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider_code TEXT        NOT NULL,
  label         TEXT,
  credentials   JSONB,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  tested_at     TIMESTAMPTZ,
  test_status   TEXT,
  test_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_creds_agency_provider_uq ON provider_credentials(agency_id, provider_code);

-- ══ TICKETS ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tickets (
  id                        TEXT        PRIMARY KEY,
  agency_id                 TEXT        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  pnr_id                    TEXT        NOT NULL REFERENCES pnr_records(id),
  booking_id                TEXT        REFERENCES bookings(id),
  customer_id               TEXT        REFERENCES customers(id),
  credential_id             TEXT        REFERENCES provider_credentials(id),
  issuing_provider          TEXT,
  ticket_number             TEXT,
  passenger_name            TEXT        NOT NULL,
  issued_at                 TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  status                    TEXT        NOT NULL DEFAULT 'pending',
  fare_halalas              INTEGER     NOT NULL DEFAULT 0,
  tax_halalas               INTEGER     NOT NULL DEFAULT 0,
  total_halalas             INTEGER     NOT NULL DEFAULT 0,
  issued_by                 TEXT,
  voided_at                 TIMESTAMPTZ,
  voided_by                 TEXT,
  refunded_at               TIMESTAMPTZ,
  reconciliation_attempts   INTEGER     NOT NULL DEFAULT 0,
  last_reconciliation_at    TIMESTAMPTZ,
  pending_operation_payload JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tickets_agency_idx ON tickets(agency_id);
CREATE INDEX IF NOT EXISTS tickets_pnr_idx    ON tickets(pnr_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_number_uq ON tickets(agency_id, ticket_number);

-- ══ TICKET COUPONS ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ticket_coupons (
  id            TEXT        PRIMARY KEY,
  ticket_id     TEXT        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  segment_index INTEGER     NOT NULL,
  coupon_status TEXT        NOT NULL DEFAULT 'open',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coupons_ticket_idx ON ticket_coupons(ticket_id);

-- ══ PAYSLIPS: add employer GOSI column ═══════════════════════════════════════
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gosi_employer_halalas INTEGER NOT NULL DEFAULT 0;

-- ══ LEAVE BALANCES: annual & sick leave entitlement tracking ═════════════════
CREATE TABLE IF NOT EXISTS leave_balances (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL REFERENCES employees(id),
  year             INTEGER NOT NULL,
  annual_entitled  INTEGER NOT NULL DEFAULT 21,
  annual_used      INTEGER NOT NULL DEFAULT 0,
  sick_entitled    INTEGER NOT NULL DEFAULT 30,
  sick_used        INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, year)
);
CREATE INDEX IF NOT EXISTS leave_balances_emp_idx ON leave_balances(employee_id);

-- ══ SERVICE TYPES: add revenue_mode, vat_rate, is_taxable columns ════════════
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS revenue_mode TEXT NOT NULL DEFAULT 'principal';
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS vat_rate     INTEGER;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS is_taxable   BOOLEAN;

-- ══ CUSTOMERS: add opening_balance_halalas for AR migration ══════════════════
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_halalas INTEGER NOT NULL DEFAULT 0;

-- ══ BSP (Billing Settlement Plan) — IATA travel agencies ════════════════════
CREATE TABLE IF NOT EXISTS bsp_billings (
  id                          TEXT PRIMARY KEY,
  agency_id                   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  billing_period              TEXT NOT NULL,
  period_type                 TEXT NOT NULL DEFAULT 'monthly',
  total_sales_halalas         INTEGER NOT NULL DEFAULT 0,
  total_refunds_halalas       INTEGER NOT NULL DEFAULT 0,
  total_commission_halalas    INTEGER NOT NULL DEFAULT 0,
  net_remit_halalas           INTEGER NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'SAR',
  due_date                    TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'pending',
  payment_date                TEXT,
  bank_account_id             TEXT,
  journal_entry_id            TEXT,
  reference                   TEXT,
  notes                       TEXT,
  created_by                  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bsp_billings_agency_idx ON bsp_billings(agency_id);

CREATE TABLE IF NOT EXISTS bsp_adjustments (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  issue_date       TEXT NOT NULL,
  due_date         TEXT,
  amount_halalas   INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'SAR',
  reason           TEXT NOT NULL,
  airline_code     TEXT,
  ticket_numbers   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  bsp_billing_id   TEXT REFERENCES bsp_billings(id),
  journal_entry_id TEXT,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bsp_adj_agency_idx ON bsp_adjustments(agency_id);

-- ══ INVOICES: deferred-revenue tracking (IFRS 15) ════════════════════════════
-- For future-dated Umrah/Hajj/package invoices the revenue is deferred until the
-- service is delivered (travel date). deferred_until holds that date; once the
-- recognition journal (Dr 3201 / Cr 4100) is posted, revenue_recognized_at is set.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deferred_until         TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS revenue_recognized_at  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_invoice_id    TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_deferred ON invoices(agency_id, deferred_until);

-- ══ EOSB ACCRUALS (IAS 19 — Saudi Labor Law art. 84) ═════════════════════════
-- One row per agency+month tracking that the monthly EOSB provision was posted,
-- preventing duplicate accruals for the same period.
CREATE TABLE IF NOT EXISTS eosb_accruals (
  id                TEXT PRIMARY KEY,
  agency_id         TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  month             TEXT NOT NULL,
  amount_halalas    INTEGER NOT NULL DEFAULT 0,
  employee_count    INTEGER NOT NULL DEFAULT 0,
  journal_entry_id  TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, month)
);
CREATE INDEX IF NOT EXISTS idx_eosb_accruals_agency ON eosb_accruals(agency_id);

-- ══ AGENCY FEATURES (per-agency feature flag overrides) ══════════════════════
CREATE TABLE IF NOT EXISTS agency_features (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL,
  override_type TEXT NOT NULL,
  enabled_by    TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, feature_key)
);
CREATE INDEX IF NOT EXISTS agency_features_agency_idx ON agency_features(agency_id);

-- ══ PERFORMANCE INDEXES (financial query hot paths) ══════════════════════════
-- Composite indexes that back the agency-scoped report/GL/list queries.
CREATE INDEX IF NOT EXISTS idx_invoices_agency_status   ON invoices(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_je_agency_source         ON journal_entries(agency_id, source);
CREATE INDEX IF NOT EXISTS idx_bookings_agency_status   ON bookings(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_booking         ON payments(booking_id);
-- Drop the broad (non-partial) booking-uniqueness index. It blocked credit notes
-- (type=381) and refunds from sharing a bookingId with the original invoice
-- (type=380). The partial invoices_one_per_booking index (type='380' only) is the
-- correct constraint and remains in place.
DROP INDEX IF EXISTS uq_invoices_agency_booking;

-- ══ WIDEN MONETARY COLUMNS TO BIGINT ═════════════════════════════════════════
-- Hajj/Umrah group invoices and BSP remittances can exceed the 32-bit signed
-- limit (~21M SAR). Widening integer→bigint is a metadata-only change in
-- PostgreSQL (no table rewrite) and is safe to re-run.
ALTER TABLE invoices          ALTER COLUMN subtotal_halalas TYPE BIGINT, ALTER COLUMN vat_halalas TYPE BIGINT, ALTER COLUMN total_halalas TYPE BIGINT, ALTER COLUMN paid_halalas TYPE BIGINT;
ALTER TABLE journal_entries   ALTER COLUMN total_debit_halalas TYPE BIGINT, ALTER COLUMN total_credit_halalas TYPE BIGINT;
ALTER TABLE journal_lines     ALTER COLUMN debit_halalas TYPE BIGINT, ALTER COLUMN credit_halalas TYPE BIGINT;
ALTER TABLE chart_of_accounts ALTER COLUMN opening_balance_halalas TYPE BIGINT;
ALTER TABLE bookings          ALTER COLUMN total_price_halalas TYPE BIGINT, ALTER COLUMN cost_price_halalas TYPE BIGINT, ALTER COLUMN profit_halalas TYPE BIGINT, ALTER COLUMN paid_halalas TYPE BIGINT;
ALTER TABLE payments          ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE receipt_vouchers  ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE supplier_payments ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE customers         ALTER COLUMN credit_limit_halalas TYPE BIGINT, ALTER COLUMN opening_balance_halalas TYPE BIGINT;
ALTER TABLE suppliers         ALTER COLUMN balance_halalas TYPE BIGINT;
ALTER TABLE recurring_invoices ALTER COLUMN subtotal_halalas TYPE BIGINT, ALTER COLUMN vat_halalas TYPE BIGINT, ALTER COLUMN total_halalas TYPE BIGINT;
ALTER TABLE bsp_billings      ALTER COLUMN total_sales_halalas TYPE BIGINT, ALTER COLUMN total_refunds_halalas TYPE BIGINT, ALTER COLUMN total_commission_halalas TYPE BIGINT, ALTER COLUMN net_remit_halalas TYPE BIGINT;
ALTER TABLE bsp_adjustments   ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE bank_accounts     ALTER COLUMN opening_balance_halalas TYPE BIGINT, ALTER COLUMN current_balance_halalas TYPE BIGINT, ALTER COLUMN reconciled_balance_halalas TYPE BIGINT;
ALTER TABLE bank_transactions ALTER COLUMN amount_halalas TYPE BIGINT, ALTER COLUMN balance_after_halalas TYPE BIGINT;
ALTER TABLE cheques           ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE pnr_records       ALTER COLUMN fare_halalas TYPE BIGINT, ALTER COLUMN tax_halalas TYPE BIGINT, ALTER COLUMN total_halalas TYPE BIGINT;
ALTER TABLE tickets           ALTER COLUMN fare_halalas TYPE BIGINT, ALTER COLUMN tax_halalas TYPE BIGINT, ALTER COLUMN total_halalas TYPE BIGINT;
ALTER TABLE quotes            ALTER COLUMN total_halalas TYPE BIGINT;
ALTER TABLE employees         ALTER COLUMN salary_halalas TYPE BIGINT;
ALTER TABLE employee_contracts ALTER COLUMN base_salary_halalas TYPE BIGINT, ALTER COLUMN housing_allowance_halalas TYPE BIGINT, ALTER COLUMN transport_allowance_halalas TYPE BIGINT, ALTER COLUMN other_allowances_halalas TYPE BIGINT;
ALTER TABLE payslips          ALTER COLUMN base_salary_halalas TYPE BIGINT, ALTER COLUMN housing_allowance_halalas TYPE BIGINT, ALTER COLUMN transport_allowance_halalas TYPE BIGINT, ALTER COLUMN other_allowances_halalas TYPE BIGINT, ALTER COLUMN gross_halalas TYPE BIGINT, ALTER COLUMN deductions_halalas TYPE BIGINT, ALTER COLUMN advance_deduction_halalas TYPE BIGINT, ALTER COLUMN gosi_employee_halalas TYPE BIGINT, ALTER COLUMN gosi_employer_halalas TYPE BIGINT, ALTER COLUMN net_halalas TYPE BIGINT;
ALTER TABLE salary_advances   ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE salary_payments   ALTER COLUMN amount_halalas TYPE BIGINT;
ALTER TABLE eosb_accruals     ALTER COLUMN amount_halalas TYPE BIGINT;

`;

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'] ?? '';

export async function POST(req: NextRequest) {
  // Accept either the setup secret header OR a Firebase auth token (admin/owner role)
  const secret     = req.headers.get('x-setup-secret');
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authorized = false;

  if (secret && secret === process.env.SETUP_SECRET) {
    authorized = true;
  } else if (bearerToken) {
    try {
      const { ensureAdminApp } = await import('@/lib/firebase-admin');
      ensureAdminApp();
      const { getAuth } = await import('firebase-admin/auth');
      const decoded = await getAuth().verifyIdToken(bearerToken);
      const role    = decoded['role'] as string | undefined;
      const email   = decoded.email ?? '';
      if (role === 'admin' || role === 'owner' || email === SUPER_ADMIN_EMAIL) {
        authorized = true;
      }
    } catch {
      // invalid token — fall through to 401
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      ok: false,
      error: 'DATABASE_URL is not set. Add it to Vercel environment variables.',
    }, { status: 503 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Strip single-line comments, split on semicolons, run each statement separately.
    // Neon serverless doesn't allow multiple commands in one prepared statement.
    const statements = CREATE_TABLES_SQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await sql.query(stmt);
    }

    return NextResponse.json({ ok: true, message: 'All tables created successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: 'setup_db_failed', error: message }));
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
