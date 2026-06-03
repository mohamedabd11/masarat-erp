-- RLS (Row Level Security) for multi-tenant agency isolation
-- All tables below have an agency_id column referencing agencies(id).
--
-- Strategy:
--   1. Enable RLS on every multi-tenant table.
--   2. PERMISSIVE bypass policy for CURRENT_USER (the service/superuser role the
--      application currently uses).  This preserves all existing behaviour
--      because the bypass policy is evaluated first and returns TRUE.
--   3. PERMISSIVE application policy that enforces agency_id when the session
--      variable app.current_agency_id is set.  These policies become the active
--      enforcement layer once a restricted 'app_user' role is introduced and
--      the bypass policy above is dropped.
--
-- Tables covered (confirmed agency_id column exists):
--   From migration 0000: bookings, invoices, payments, receipt_vouchers,
--     supplier_payments, quotes, chart_of_accounts, exchange_rates,
--     journal_entries, journal_lines, bank_accounts, bank_transactions,
--     cheques, employees, leave_requests, salary_payments, customers,
--     suppliers, service_types, users, agency_counters
--   From migration 0003: pnr_records, appointments, audit_log,
--     recurring_invoices, employee_contracts, payslips, salary_advances,
--     cost_centers
--   From migration 0004: shifts, attendance_records
--   From migration 0009: accounting_periods
--   From migration 0011: travel_events, provider_credentials, tickets
--
-- Tables WITHOUT agency_id (excluded): agencies, idempotency_keys, ticket_coupons

-- ============================================================
-- 1. Enable RLS
-- ============================================================

ALTER TABLE bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_vouchers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques              ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_counters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnr_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips             ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets              ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PERMISSIVE bypass for the current service/superuser role
-- ============================================================

CREATE POLICY bypass_for_service_role ON bookings             AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON invoices             AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON payments             AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON receipt_vouchers     AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON supplier_payments    AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON quotes               AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON chart_of_accounts    AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON exchange_rates       AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON journal_entries      AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON journal_lines        AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON bank_accounts        AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON bank_transactions    AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON cheques              AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON employees            AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON leave_requests       AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON salary_payments      AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON customers            AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON suppliers            AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON service_types        AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON users                AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON agency_counters      AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON pnr_records          AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON appointments         AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON audit_log            AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON recurring_invoices   AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON employee_contracts   AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON payslips             AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON salary_advances      AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON cost_centers         AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON shifts               AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON attendance_records   AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON accounting_periods   AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON travel_events        AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON provider_credentials AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON tickets              AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);

-- ============================================================
-- 3. Application-level agency isolation policy
--    Allows all rows when no context is set (empty string),
--    otherwise restricts to the matching agency_id.
--    Activated for the future restricted 'app_user' role.
-- ============================================================

CREATE POLICY agency_isolation ON bookings AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON invoices AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON payments AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON receipt_vouchers AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON supplier_payments AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON quotes AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON chart_of_accounts AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON exchange_rates AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON journal_entries AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON journal_lines AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON bank_accounts AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON bank_transactions AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON cheques AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON employees AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON leave_requests AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON salary_payments AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON customers AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON suppliers AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON service_types AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON users AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON agency_counters AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON pnr_records AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON appointments AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON audit_log AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON recurring_invoices AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON employee_contracts AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON payslips AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON salary_advances AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON cost_centers AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON shifts AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON attendance_records AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON accounting_periods AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON travel_events AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON provider_credentials AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );

CREATE POLICY agency_isolation ON tickets AS PERMISSIVE FOR ALL
  USING (
    current_setting('app.current_agency_id', true) IS NULL OR
    current_setting('app.current_agency_id', true) = '' OR
    agency_id = current_setting('app.current_agency_id', true)
  );
