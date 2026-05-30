-- Migration 0010: Enforce one original invoice (type '380') per booking per agency
-- This prevents duplicate invoices from concurrent creation requests.

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_booking
  ON invoices(booking_id, agency_id)
  WHERE type = '380' AND booking_id IS NOT NULL;
