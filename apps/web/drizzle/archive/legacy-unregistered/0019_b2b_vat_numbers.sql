-- B2B VAT number capture: customers may carry a 15-digit KSA VAT registration
-- number, and invoices snapshot the buyer's VAT number at issuance so ZATCA
-- e-invoices are correctly classified as B2B (clearance) vs B2C (reporting).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS buyer_vat_number TEXT;
