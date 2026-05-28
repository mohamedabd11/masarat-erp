-- ============================================================
-- Migration 0003: PNR, Appointments, Audit Log, Recurring
--                 Invoices, HR Contracts/Payslips/Advances,
--                 Cost Centers
-- ============================================================

-- ── PNR Records ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pnr_records (
  id               text PRIMARY KEY,
  agency_id        text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  pnr_code         text NOT NULL,
  gds              text,
  airline          text,
  flight_numbers   text,
  origin           text,
  destination      text,
  departure_date   text,
  return_date      text,
  passenger_count  integer NOT NULL DEFAULT 1,
  passenger_names  text,
  ticket_numbers   text,
  fare_halalas     integer NOT NULL DEFAULT 0,
  tax_halalas      integer NOT NULL DEFAULT 0,
  total_halalas    integer NOT NULL DEFAULT 0,
  booking_id       text REFERENCES bookings(id),
  customer_id      text REFERENCES customers(id),
  status           text NOT NULL DEFAULT 'active',
  notes            text,
  expires_at       text,
  created_by       text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pnr_agency_code_uq ON pnr_records (agency_id, pnr_code);

-- ── Customer Appointments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id             text PRIMARY KEY,
  agency_id      text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id    text REFERENCES customers(id),
  customer_name  text,
  assigned_to    text REFERENCES employees(id),
  title          text NOT NULL,
  description    text,
  type           text NOT NULL DEFAULT 'meeting',
  status         text NOT NULL DEFAULT 'scheduled',
  scheduled_at   timestamp NOT NULL,
  duration_min   text NOT NULL DEFAULT '30',
  location       text,
  notes          text,
  outcome        text,
  created_by     text,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_agency_date_idx ON appointments (agency_id, scheduled_at);
CREATE INDEX IF NOT EXISTS appointments_customer_idx    ON appointments (customer_id);

-- ── Audit Log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           text PRIMARY KEY,
  agency_id    text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  user_email   text,
  action       text NOT NULL,
  resource     text NOT NULL,
  resource_id  text,
  before       jsonb,
  after        jsonb,
  metadata     jsonb,
  created_at   timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_agency_idx    ON audit_log (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx  ON audit_log (resource, resource_id);
CREATE INDEX IF NOT EXISTS audit_log_user_idx      ON audit_log (user_id);

-- ── Recurring Invoices ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id                  text PRIMARY KEY,
  agency_id           text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id         text REFERENCES customers(id),
  title               text NOT NULL,
  subtotal_halalas    integer NOT NULL DEFAULT 0,
  vat_halalas         integer NOT NULL DEFAULT 0,
  total_halalas       integer NOT NULL DEFAULT 0,
  items               jsonb,
  notes               text,
  frequency           text NOT NULL DEFAULT 'monthly',
  day_of_month        integer,
  start_date          text NOT NULL,
  end_date            text,
  last_issued_at      text,
  next_issue_at       text NOT NULL,
  total_issued        integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  buyer_name_ar       text,
  payment_method      text,
  created_by          text,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_invoices_next_issue_idx ON recurring_invoices (next_issue_at) WHERE is_active = true;

-- ── Employee Contracts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_contracts (
  id                           text PRIMARY KEY,
  agency_id                    text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id                  text NOT NULL REFERENCES employees(id),
  contract_number              text NOT NULL,
  type                         text NOT NULL DEFAULT 'full_time',
  start_date                   text NOT NULL,
  end_date                     text,
  base_salary_halalas          integer NOT NULL DEFAULT 0,
  housing_allowance_halalas    integer NOT NULL DEFAULT 0,
  transport_allowance_halalas  integer NOT NULL DEFAULT 0,
  other_allowances_halalas     integer NOT NULL DEFAULT 0,
  salary_components            jsonb,
  working_days_per_week        integer NOT NULL DEFAULT 5,
  working_hours_per_day        integer NOT NULL DEFAULT 8,
  annual_leave_days            integer NOT NULL DEFAULT 21,
  status                       text NOT NULL DEFAULT 'active',
  notes                        text,
  created_by                   text,
  created_at                   timestamp NOT NULL DEFAULT now(),
  updated_at                   timestamp NOT NULL DEFAULT now()
);

-- ── Payslips ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payslips (
  id                          text PRIMARY KEY,
  agency_id                   text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id                 text NOT NULL REFERENCES employees(id),
  salary_payment_id           text,
  month                       text NOT NULL,
  base_salary_halalas         integer NOT NULL DEFAULT 0,
  housing_allowance_halalas   integer NOT NULL DEFAULT 0,
  transport_allowance_halalas integer NOT NULL DEFAULT 0,
  other_allowances_halalas    integer NOT NULL DEFAULT 0,
  gross_halalas               integer NOT NULL DEFAULT 0,
  deductions_halalas          integer NOT NULL DEFAULT 0,
  advance_deduction_halalas   integer NOT NULL DEFAULT 0,
  gosi_employee_halalas       integer NOT NULL DEFAULT 0,
  net_halalas                 integer NOT NULL DEFAULT 0,
  components                  jsonb,
  payment_date                text,
  payment_method              text,
  created_at                  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_month_uq ON payslips (employee_id, month);

-- ── Salary Advances ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_advances (
  id               text PRIMARY KEY,
  agency_id        text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id      text NOT NULL REFERENCES employees(id),
  amount_halalas   integer NOT NULL,
  request_date     text NOT NULL,
  deduct_from      text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  reason           text,
  approved_by      text,
  journal_entry_id text,
  created_by       text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

-- ── Cost Centers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_centers (
  id          text PRIMARY KEY,
  agency_id   text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text,
  type        text NOT NULL DEFAULT 'department',
  parent_id   text,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_agency_code_uq ON cost_centers (agency_id, code);
