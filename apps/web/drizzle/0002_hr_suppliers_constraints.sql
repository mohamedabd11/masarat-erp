-- Migration: HR & Suppliers data integrity constraints
-- Phase 6 fix

-- Unique employee number per agency (prevents duplicate payroll records)
CREATE UNIQUE INDEX IF NOT EXISTS employees_agency_number_uq
  ON employees (agency_id, employee_number);

-- Unique supplier VAT number per agency (prevents duplicate supplier tax records)
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_agency_vat_uq
  ON suppliers (agency_id, vat_number)
  WHERE vat_number IS NOT NULL AND vat_number != '';

-- Link cheques to a bank account for reconciliation
ALTER TABLE cheques
  ADD COLUMN IF NOT EXISTS bank_account_id text REFERENCES bank_accounts(id);
