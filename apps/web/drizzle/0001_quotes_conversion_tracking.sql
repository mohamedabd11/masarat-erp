-- Migration: Add conversion tracking columns to quotes + unique constraint on quote number per agency
-- Phase 5 fix: prevents duplicate conversions and enables audit trail

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS converted_to_booking_id text,
  ADD COLUMN IF NOT EXISTS converted_at             timestamp;

-- Unique quote number per agency (prevents counter corruption causing duplicate numbers)
CREATE UNIQUE INDEX IF NOT EXISTS quotes_agency_number_uq
  ON quotes (agency_id, quote_number);
