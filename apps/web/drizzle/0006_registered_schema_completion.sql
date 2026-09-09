-- Registered completion of the canonical schema. This migration is deliberately
-- idempotent because older deployments may already contain some of these
-- objects from the former boot-time reconciliation path.
CREATE TABLE IF NOT EXISTS "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_terminations" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"termination_date" text NOT NULL,
	"termination_type" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"last_wage_halalas" bigint NOT NULL,
	"base_benefit_halalas" bigint NOT NULL,
	"entitlement_rate_bps" integer DEFAULT 10000 NOT NULL,
	"settlement_halalas" bigint NOT NULL,
	"provision_applied_halalas" bigint DEFAULT 0 NOT NULL,
	"provision_reversed_halalas" bigint DEFAULT 0 NOT NULL,
	"settlement_journal_entry_id" text,
	"payment_journal_entry_id" text,
	"payment_method" text,
	"created_by" text,
	"approved_by" text,
	"paid_by" text,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eosb_employee_provisions" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"accrual_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"month" text NOT NULL,
	"target_halalas" bigint DEFAULT 0 NOT NULL,
	"change_halalas" bigint DEFAULT 0 NOT NULL,
	"last_wage_halalas" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gosi_rate_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"scheme" text NOT NULL,
	"effective_from" text NOT NULL,
	"pension_employee_rate_bps" integer DEFAULT 0 NOT NULL,
	"pension_employer_rate_bps" integer DEFAULT 0 NOT NULL,
	"saned_employee_rate_bps" integer DEFAULT 0 NOT NULL,
	"saned_employer_rate_bps" integer DEFAULT 0 NOT NULL,
	"occupational_employer_rate_bps" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salary_advance_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"advance_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"installment_number" integer NOT NULL,
	"due_month" text NOT NULL,
	"amount_halalas" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payslip_id" text,
	"original_due_month" text NOT NULL,
	"deferral_count" integer DEFAULT 0 NOT NULL,
	"deducted_at" timestamp,
	"repaid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "customer_name_en" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "customer_email" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "subtotal_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "vat_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "issue_date" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "terms" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "department_id" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gosi_scheme" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gosi_enrollment_date" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "saned_applicable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "gosi_contributory_wage_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "gosi_employee_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "gosi_employer_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "gosi_scheme" text;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD COLUMN IF NOT EXISTS "installment_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD COLUMN IF NOT EXISTS "remaining_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD COLUMN IF NOT EXISTS "payment_method" text;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD COLUMN IF NOT EXISTS "settled_at" timestamp;--> statement-breakpoint

-- Add every required FK only when an equivalent relationship is absent. Older
-- boot-time migrations used PostgreSQL's default constraint names, so checking
-- by relationship avoids creating duplicate foreign keys under a new name.
DO $fks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='departments'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (agency_id) REFERENCES agencies(id)%') THEN
    ALTER TABLE departments ADD CONSTRAINT departments_agency_id_agencies_id_fk FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='employee_terminations'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (agency_id) REFERENCES agencies(id)%') THEN
    ALTER TABLE employee_terminations ADD CONSTRAINT employee_terminations_agency_id_agencies_id_fk FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='employee_terminations'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (employee_id) REFERENCES employees(id)%') THEN
    ALTER TABLE employee_terminations ADD CONSTRAINT employee_terminations_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='eosb_employee_provisions'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (agency_id) REFERENCES agencies(id)%') THEN
    ALTER TABLE eosb_employee_provisions ADD CONSTRAINT eosb_employee_provisions_agency_id_agencies_id_fk FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='eosb_employee_provisions'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (accrual_id) REFERENCES eosb_accruals(id)%') THEN
    ALTER TABLE eosb_employee_provisions ADD CONSTRAINT eosb_employee_provisions_accrual_id_eosb_accruals_id_fk FOREIGN KEY (accrual_id) REFERENCES eosb_accruals(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='eosb_employee_provisions'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (employee_id) REFERENCES employees(id)%') THEN
    ALTER TABLE eosb_employee_provisions ADD CONSTRAINT eosb_employee_provisions_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='salary_advance_installments'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (agency_id) REFERENCES agencies(id)%') THEN
    ALTER TABLE salary_advance_installments ADD CONSTRAINT salary_advance_installments_agency_id_agencies_id_fk FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='salary_advance_installments'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (advance_id) REFERENCES salary_advances(id)%') THEN
    ALTER TABLE salary_advance_installments ADD CONSTRAINT salary_advance_installments_advance_id_salary_advances_id_fk FOREIGN KEY (advance_id) REFERENCES salary_advances(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='salary_advance_installments'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (employee_id) REFERENCES employees(id)%') THEN
    ALTER TABLE salary_advance_installments ADD CONSTRAINT salary_advance_installments_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='salary_advance_installments'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (payslip_id) REFERENCES payslips(id)%') THEN
    ALTER TABLE salary_advance_installments ADD CONSTRAINT salary_advance_installments_payslip_id_payslips_id_fk FOREIGN KEY (payslip_id) REFERENCES payslips(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='employees'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (department_id) REFERENCES departments(id)%') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END
$fks$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "departments_agency_code_uq" ON "departments" USING btree ("agency_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "departments_agency_name_ar_uq" ON "departments" USING btree ("agency_id","name_ar");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_terminations_employee_idx" ON "employee_terminations" USING btree ("agency_id","employee_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eosb_employee_provisions_month_uq" ON "eosb_employee_provisions" USING btree ("agency_id","employee_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eosb_employee_provisions_latest_idx" ON "eosb_employee_provisions" USING btree ("agency_id","employee_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gosi_rate_periods_scheme_date_uq" ON "gosi_rate_periods" USING btree ("scheme","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "salary_advance_installments_number_uq" ON "salary_advance_installments" USING btree ("advance_id","installment_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_advance_installments_due_idx" ON "salary_advance_installments" USING btree ("agency_id","employee_id","due_month","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_agency_department_idx" ON "employees" USING btree ("agency_id","department_id");--> statement-breakpoint

-- Data reconciliation that a generated schema snapshot cannot represent.
INSERT INTO chart_of_accounts (
  id, agency_id, code, name_ar, name_en, type,
  is_system, allow_direct_entry, level, created_at, updated_at
)
SELECT a.id || '-coa-2510', a.id, '2510', 'مكافأة نهاية الخدمة مستحقة',
       'EOSB Payable', 'liability', TRUE, TRUE, 1, NOW(), NOW()
FROM agencies a
ON CONFLICT (agency_id, code) DO NOTHING;--> statement-breakpoint

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
ON CONFLICT (agency_id, code) DO NOTHING;--> statement-breakpoint

UPDATE employees e
SET department_id = d.id
FROM departments d
WHERE e.department_id IS NULL
  AND d.agency_id = e.agency_id
  AND d.code = e.department;--> statement-breakpoint

UPDATE employees
SET gosi_scheme = 'expat', saned_applicable = FALSE
WHERE nationality_type = 'expat';--> statement-breakpoint

INSERT INTO gosi_rate_periods (
  id, scheme, effective_from, pension_employee_rate_bps,
  pension_employer_rate_bps, saned_employee_rate_bps,
  saned_employer_rate_bps, occupational_employer_rate_bps
) VALUES
  ('gosi-legacy-2022-01-01', 'legacy', '2022-01-01', 900, 900, 75, 75, 200),
  ('gosi-new-2024-07-03',    'new',    '2024-07-03', 900, 900, 75, 75, 200),
  ('gosi-new-2025-07-01',    'new',    '2025-07-01', 950, 950, 75, 75, 200),
  ('gosi-new-2026-07-01',    'new',    '2026-07-01', 1000, 1000, 75, 75, 200),
  ('gosi-new-2027-07-01',    'new',    '2027-07-01', 1050, 1050, 75, 75, 200),
  ('gosi-new-2028-07-01',    'new',    '2028-07-01', 1100, 1100, 75, 75, 200),
  ('gosi-expat-2022-01-01',  'expat',  '2022-01-01', 0, 0, 0, 0, 200)
ON CONFLICT (scheme, effective_from) DO NOTHING;--> statement-breakpoint

UPDATE salary_advances
SET remaining_halalas = amount_halalas
WHERE status = 'paid' AND remaining_halalas = 0;--> statement-breakpoint

INSERT INTO salary_advance_installments (
  id, agency_id, advance_id, employee_id, installment_number, due_month,
  amount_halalas, status, original_due_month, deducted_at, repaid_at
)
SELECT sa.id || '-installment-1', sa.agency_id, sa.id, sa.employee_id, 1,
       sa.deduct_from, sa.amount_halalas,
       CASE WHEN sa.status = 'deducted' THEN 'deducted'
            WHEN sa.status = 'repaid' THEN 'repaid'
            ELSE 'pending' END,
       sa.deduct_from,
       CASE WHEN sa.status = 'deducted' THEN COALESCE(sa.updated_at, sa.created_at) END,
       CASE WHEN sa.status = 'repaid' THEN COALESCE(sa.settled_at, sa.updated_at, sa.created_at) END
FROM salary_advances sa
WHERE sa.status IN ('paid', 'deducted', 'repaid')
ON CONFLICT (advance_id, installment_number) DO NOTHING;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS employee_terminations_open_uq
  ON employee_terminations(agency_id, employee_id)
  WHERE status IN ('draft', 'approved');--> statement-breakpoint

-- The application owner also owns these tables, so FORCE is required for RLS
-- to protect tenant-scoped transactions. With no tenant context the policy is
-- intentionally fail-open for cron, setup, and super-admin paths.
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments', 'salary_advance_installments',
    'eosb_employee_provisions', 'employee_terminations'
  ]
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
