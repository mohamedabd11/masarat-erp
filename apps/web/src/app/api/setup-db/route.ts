/**
 * One-time database setup endpoint.
 * Creates all Postgres tables from scratch.
 * Protected by SETUP_SECRET env variable.
 *
 * Usage (after deploying to Vercel):
 *   POST /api/setup-db
 *   Header: x-setup-secret: <SETUP_SECRET value from Vercel env>
 */
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'edge';

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

-- ══ PAYMENTS ═════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  agency_id       TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  invoice_id      TEXT REFERENCES invoices(id),
  booking_id      TEXT REFERENCES bookings(id),
  customer_id     TEXT REFERENCES customers(id),
  customer_name   TEXT,
  amount_halalas  INTEGER NOT NULL,
  method          TEXT NOT NULL,
  reference       TEXT,
  date            TEXT NOT NULL,
  notes           TEXT,
  journal_entry_id TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  booking_number      TEXT,
  date                TEXT NOT NULL,
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
  account_id      TEXT NOT NULL REFERENCES chart_of_accounts(id),
  debit_halalas   INTEGER NOT NULL DEFAULT 0,
  credit_halalas  INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry   ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

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
  id              TEXT PRIMARY KEY,
  agency_id       TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  cheque_number   TEXT NOT NULL,
  bank_name       TEXT,
  amount_halalas  INTEGER NOT NULL,
  type            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  issue_date      TEXT,
  due_date        TEXT,
  payer_name      TEXT,
  payee_name      TEXT,
  related_id      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cheques_agency ON cheques(agency_id);

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
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

`;

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-setup-secret');
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Use query() method instead of tagged template for dynamic SQL strings
    await sql.query(CREATE_TABLES_SQL);
    return NextResponse.json({ ok: true, message: 'All tables created successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
