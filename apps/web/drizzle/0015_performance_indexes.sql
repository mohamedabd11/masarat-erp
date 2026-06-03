-- ════════════════════════════════════════════════════════════════════════════
-- 0015 — Additional performance indexes
-- ════════════════════════════════════════════════════════════════════════════
-- Covers query patterns not addressed by 0012/0014:
--   • Booking list filtered by customer within an agency
--   • Booking list sorted by creation date (dashboard / recent activity)
--   • Invoice list filtered/sorted by issue_date (financial reports use
--     issue_date, not created_at, for period filtering)
--   • Quotes filtered by agency (list view) and agency+status (pipeline)
--   • HR tables (employees, salary_payments, leave_requests,
--     attendance_records, payslips, salary_advances) which had no
--     agency-scoped or FK indexes at all
--
-- All statements use IF NOT EXISTS so the migration is idempotent.

-- ── BOOKINGS ─────────────────────────────────────────────────────────────────
-- Filter bookings by customer within an agency (customer booking history)
CREATE INDEX IF NOT EXISTS idx_bookings_agency_customer
  ON bookings(agency_id, customer_id);

-- Sort bookings by creation date for dashboard / recent-activity views
CREATE INDEX IF NOT EXISTS idx_bookings_agency_created
  ON bookings(agency_id, created_at DESC);

-- ── INVOICES ─────────────────────────────────────────────────────────────────
-- Financial period reports filter on issue_date (not created_at)
CREATE INDEX IF NOT EXISTS idx_invoices_agency_issue_date
  ON invoices(agency_id, issue_date DESC);

-- ── QUOTES ───────────────────────────────────────────────────────────────────
-- Agency-scoped list view (quotes_agency_number_uq covers agency+number lookups
-- but not agency-only scans)
CREATE INDEX IF NOT EXISTS idx_quotes_agency
  ON quotes(agency_id);

-- Filter quotes pipeline by status (draft|sent|accepted|rejected|expired|converted)
CREATE INDEX IF NOT EXISTS idx_quotes_agency_status
  ON quotes(agency_id, status);

-- ── EMPLOYEES ────────────────────────────────────────────────────────────────
-- Employees table had no index at all beyond the PK
CREATE INDEX IF NOT EXISTS idx_employees_agency
  ON employees(agency_id);

-- Filter active employees only (used by payroll and attendance lookups)
CREATE INDEX IF NOT EXISTS idx_employees_agency_active
  ON employees(agency_id, is_active);

-- ── SALARY PAYMENTS ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_salary_payments_agency
  ON salary_payments(agency_id);

CREATE INDEX IF NOT EXISTS idx_salary_payments_employee
  ON salary_payments(employee_id);

-- Filter salary payments by payroll month (YYYY-MM)
CREATE INDEX IF NOT EXISTS idx_salary_payments_agency_month
  ON salary_payments(agency_id, month);

-- ── LEAVE REQUESTS ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leave_requests_agency
  ON leave_requests(agency_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests(employee_id);

-- Approval queue: filter pending leave requests per agency
CREATE INDEX IF NOT EXISTS idx_leave_requests_agency_status
  ON leave_requests(agency_id, status);

-- ── ATTENDANCE RECORDS ───────────────────────────────────────────────────────
-- attendance_employee_date_uq covers per-employee lookups; add agency-scoped
-- index for manager dashboards and payroll period queries
CREATE INDEX IF NOT EXISTS idx_attendance_agency_date
  ON attendance_records(agency_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date_range
  ON attendance_records(employee_id, date DESC);

-- ── PAYSLIPS ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payslips_agency
  ON payslips(agency_id);

CREATE INDEX IF NOT EXISTS idx_payslips_employee
  ON payslips(employee_id);

-- Payslip history per employee by month
CREATE INDEX IF NOT EXISTS idx_payslips_employee_month
  ON payslips(employee_id, month DESC);

-- ── SALARY ADVANCES ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_salary_advances_agency
  ON salary_advances(agency_id);

CREATE INDEX IF NOT EXISTS idx_salary_advances_employee
  ON salary_advances(employee_id);

-- Filter pending/approved advances (approval workflow)
CREATE INDEX IF NOT EXISTS idx_salary_advances_agency_status
  ON salary_advances(agency_id, status);
