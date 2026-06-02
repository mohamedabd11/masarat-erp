-- Prevent duplicate invoice/journal/voucher numbers within the same agency.
-- These numbers must be unique per agency for ZATCA compliance and audit trails.

CREATE UNIQUE INDEX IF NOT EXISTS invoices_agency_number_uq
  ON invoices (agency_id, invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_agency_number_uq
  ON journal_entries (agency_id, entry_number);

CREATE UNIQUE INDEX IF NOT EXISTS payments_agency_voucher_uq
  ON payments (agency_id, voucher_number);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_vouchers_agency_voucher_uq
  ON receipt_vouchers (agency_id, voucher_number);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_payments_agency_voucher_uq
  ON supplier_payments (agency_id, voucher_number);
