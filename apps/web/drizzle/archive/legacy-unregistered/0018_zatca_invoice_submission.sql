-- ZATCA Phase 2 — per-invoice submission tracking + agency ICV counter
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS zatca_status       TEXT NOT NULL DEFAULT 'not_submitted', -- not_submitted|pending|cleared|reported|warning|failed
  ADD COLUMN IF NOT EXISTS zatca_icv          BIGINT,        -- invoice counter value assigned at signing
  ADD COLUMN IF NOT EXISTS zatca_pih          TEXT,          -- previous invoice hash used in the chain
  ADD COLUMN IF NOT EXISTS zatca_qr           TEXT,          -- QR TLV base64 (Phase 1 at issuance, Phase 2 after signing)
  ADD COLUMN IF NOT EXISTS zatca_signed_xml   TEXT,          -- signed UBL 2.1 XML
  ADD COLUMN IF NOT EXISTS zatca_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zatca_response     JSONB;         -- validationResults from ZATCA

-- ICV must be monotonically increasing per agency (invoice numbers reset yearly; ICV never resets)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS zatca_invoice_counter BIGINT NOT NULL DEFAULT 0;
