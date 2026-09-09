-- Migration 0006: Link credit/debit notes to original invoices

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_invoice_id text REFERENCES invoices(id);

CREATE INDEX IF NOT EXISTS invoices_original_invoice_idx ON invoices(original_invoice_id);
