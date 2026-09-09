-- Fix booking↔invoice uniqueness so refunds can post.
--
-- The unfiltered unique index uq_invoices_agency_booking on
-- invoices(agency_id, booking_id) made every booking-linked credit note
-- (type 381, created by refunds) and debit note (383) collide (23505) with the
-- original invoice — refunds could never be recorded.
--
-- Replace it with a PARTIAL unique index constraining only ORIGINAL invoices
-- (type 380 legacy / 388 simplified). Credit/debit notes share the same
-- booking_id freely; standalone invoices (booking_id NULL) stay unconstrained.
-- The stale type='380'-only partial index is also dropped/recreated because the
-- app issues type '388', so the old predicate never matched.

DROP INDEX IF EXISTS uq_invoices_agency_booking;
DROP INDEX IF EXISTS invoices_one_per_booking;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_booking
  ON invoices(agency_id, booking_id)
  WHERE type IN ('380','388') AND booking_id IS NOT NULL;
