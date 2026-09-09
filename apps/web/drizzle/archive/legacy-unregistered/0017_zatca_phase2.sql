-- ZATCA Phase 2 columns for agencies table
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS zatca_environment text NOT NULL DEFAULT 'simulation',
  ADD COLUMN IF NOT EXISTS zatca_onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS zatca_compliance_request_id text,
  ADD COLUMN IF NOT EXISTS zatca_compliance_csid text,     -- encrypted, base64 token from ZATCA
  ADD COLUMN IF NOT EXISTS zatca_compliance_secret text,   -- encrypted API secret
  ADD COLUMN IF NOT EXISTS zatca_production_csid text,     -- encrypted production token
  ADD COLUMN IF NOT EXISTS zatca_production_secret text,   -- encrypted production secret
  ADD COLUMN IF NOT EXISTS zatca_private_key text,         -- encrypted EC private key PEM
  ADD COLUMN IF NOT EXISTS zatca_certificate_pem text,     -- decoded certificate PEM from CSID
  ADD COLUMN IF NOT EXISTS zatca_certificate_expiry timestamp with time zone,
  ADD COLUMN IF NOT EXISTS zatca_last_invoice_hash text,   -- hash chaining for sequential invoices
  ADD COLUMN IF NOT EXISTS zatca_onboarded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS zatca_error_message text;       -- last error if onboarding failed

-- Status values: not_started | pending_otp | compliance | production | error
-- Environment values: simulation | production
