-- HR lifecycle hardening: persistent departments, effective-dated GOSI,
-- salary-advance installments, and auditable EOSB termination settlements.

INSERT INTO chart_of_accounts (id, agency_id, code, name_ar, name_en, type, is_system, allow_direct_entry, level, created_at, updated_at)
SELECT a.id || '-coa-2510', a.id, '2510', 'مكافأة نهاية الخدمة مستحقة', 'EOSB Payable',
       'liability', TRUE, TRUE, 1, NOW(), NOW()
FROM agencies a
ON CONFLICT (agency_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_agency_code_uq ON departments(agency_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS departments_agency_name_ar_uq ON departments(agency_id, name_ar);

INSERT INTO departments (id, agency_id, code, name_ar, name_en)
SELECT a.id || '-dept-' || d.code, a.id, d.code, d.name_ar, d.name_en
FROM agencies a
CROSS JOIN (VALUES
  ('management', 'الإدارة', 'Management'),
  ('bookings', 'الحجوزات', 'Bookings'),
  ('accounting', 'المحاسبة', 'Accounting'),
  ('customer_service', 'خدمة العملاء', 'Customer Service'),
  ('operations', 'العمليات', 'Operations')
) AS d(code, name_ar, name_en)
ON CONFLICT (agency_id, code) DO NOTHING;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gosi_scheme TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gosi_enrollment_date TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS saned_applicable BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS employees_agency_department_idx ON employees(agency_id, department_id);

UPDATE employees e
SET department_id = d.id
FROM departments d
WHERE e.department_id IS NULL
  AND d.agency_id = e.agency_id
  AND d.code = e.department;
UPDATE employees SET gosi_scheme = 'expat', saned_applicable = FALSE WHERE nationality_type = 'expat';

CREATE TABLE IF NOT EXISTS gosi_rate_periods (
  id TEXT PRIMARY KEY,
  scheme TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  pension_employee_rate_bps INTEGER NOT NULL DEFAULT 0,
  pension_employer_rate_bps INTEGER NOT NULL DEFAULT 0,
  saned_employee_rate_bps INTEGER NOT NULL DEFAULT 0,
  saned_employer_rate_bps INTEGER NOT NULL DEFAULT 0,
  occupational_employer_rate_bps INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS gosi_rate_periods_scheme_date_uq ON gosi_rate_periods(scheme, effective_from);

INSERT INTO gosi_rate_periods (
  id, scheme, effective_from, pension_employee_rate_bps, pension_employer_rate_bps,
  saned_employee_rate_bps, saned_employer_rate_bps, occupational_employer_rate_bps
) VALUES
  ('gosi-legacy-2022-01-01', 'legacy', '2022-01-01', 900, 900, 75, 75, 200),
  ('gosi-new-2024-07-03',    'new',    '2024-07-03', 900, 900, 75, 75, 200),
  ('gosi-new-2025-07-01',    'new',    '2025-07-01', 950, 950, 75, 75, 200),
  ('gosi-new-2026-07-01',    'new',    '2026-07-01', 1000, 1000, 75, 75, 200),
  ('gosi-new-2027-07-01',    'new',    '2027-07-01', 1050, 1050, 75, 75, 200),
  ('gosi-new-2028-07-01',    'new',    '2028-07-01', 1100, 1100, 75, 75, 200),
  ('gosi-expat-2022-01-01',  'expat',  '2022-01-01', 0, 0, 0, 0, 200)
ON CONFLICT (scheme, effective_from) DO NOTHING;

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gosi_contributory_wage_halalas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gosi_employee_rate_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gosi_employer_rate_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gosi_scheme TEXT;

ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS remaining_halalas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
UPDATE salary_advances SET remaining_halalas = amount_halalas WHERE status = 'paid' AND remaining_halalas = 0;

CREATE TABLE IF NOT EXISTS salary_advance_installments (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  advance_id TEXT NOT NULL REFERENCES salary_advances(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  installment_number INTEGER NOT NULL,
  due_month TEXT NOT NULL,
  amount_halalas BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payslip_id TEXT REFERENCES payslips(id),
  original_due_month TEXT NOT NULL,
  deferral_count INTEGER NOT NULL DEFAULT 0,
  deducted_at TIMESTAMPTZ,
  repaid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS salary_advance_installments_number_uq ON salary_advance_installments(advance_id, installment_number);
CREATE INDEX IF NOT EXISTS salary_advance_installments_due_idx ON salary_advance_installments(agency_id, employee_id, due_month, status);

INSERT INTO salary_advance_installments (
  id, agency_id, advance_id, employee_id, installment_number, due_month,
  amount_halalas, status, original_due_month
)
SELECT sa.id || '-installment-1', sa.agency_id, sa.id, sa.employee_id, 1, sa.deduct_from,
       sa.amount_halalas,
       CASE WHEN sa.status = 'deducted' THEN 'deducted'
            WHEN sa.status = 'rejected' THEN 'cancelled'
            ELSE 'pending' END,
       sa.deduct_from
FROM salary_advances sa
ON CONFLICT (advance_id, installment_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS eosb_employee_provisions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  accrual_id TEXT NOT NULL REFERENCES eosb_accruals(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  month TEXT NOT NULL,
  target_halalas BIGINT NOT NULL DEFAULT 0,
  change_halalas BIGINT NOT NULL DEFAULT 0,
  last_wage_halalas BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS eosb_employee_provisions_month_uq ON eosb_employee_provisions(agency_id, employee_id, month);
CREATE INDEX IF NOT EXISTS eosb_employee_provisions_latest_idx ON eosb_employee_provisions(agency_id, employee_id, month);

CREATE TABLE IF NOT EXISTS employee_terminations (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  termination_date TEXT NOT NULL,
  termination_type TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  last_wage_halalas BIGINT NOT NULL,
  base_benefit_halalas BIGINT NOT NULL,
  entitlement_rate_bps INTEGER NOT NULL DEFAULT 10000,
  settlement_halalas BIGINT NOT NULL,
  provision_applied_halalas BIGINT NOT NULL DEFAULT 0,
  provision_reversed_halalas BIGINT NOT NULL DEFAULT 0,
  settlement_journal_entry_id TEXT,
  payment_journal_entry_id TEXT,
  payment_method TEXT,
  created_by TEXT,
  approved_by TEXT,
  paid_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS employee_terminations_employee_idx ON employee_terminations(agency_id, employee_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS employee_terminations_open_uq
  ON employee_terminations(agency_id, employee_id)
  WHERE status IN ('draft', 'approved');

-- Same fail-open tenant policy used by the existing runtime migration. It is
-- restrictive whenever an authenticated request sets app.current_agency_id.
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['departments', 'salary_advance_installments', 'eosb_employee_provisions', 'employee_terminations']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS agency_isolation ON public.%I', t);
    EXECUTE format($policy$
      CREATE POLICY agency_isolation ON public.%I AS PERMISSIVE FOR ALL
      USING (
        current_setting('app.current_agency_id', true) IS NULL
        OR current_setting('app.current_agency_id', true) = ''
        OR agency_id = current_setting('app.current_agency_id', true)
      )
    $policy$, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$rls$;
