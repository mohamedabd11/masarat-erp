-- ============================================================
-- Migration 0011: Travel Events, Provider Credentials,
--                 Tickets + Coupons, PNR schema upgrades
-- ============================================================

-- ── PNR: new columns ────────────────────────────────────────
ALTER TABLE pnr_records
  ADD COLUMN IF NOT EXISTS sync_status   text,
  ADD COLUMN IF NOT EXISTS segments      jsonb,
  ADD COLUMN IF NOT EXISTS passengers    jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by  text,
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz;

-- PNR: expires_at  text → timestamptz
-- USING: coerces any ISO-8601 date string; nulls out unparseable values
ALTER TABLE pnr_records
  ALTER COLUMN expires_at TYPE timestamptz
  USING CASE
    WHEN expires_at IS NULL THEN NULL
    WHEN expires_at ~ '^\d{4}-\d{2}-\d{2}' THEN expires_at::timestamptz
    ELSE NULL
  END;

-- ── Travel Events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_events (
  id            text        PRIMARY KEY,
  agency_id     text        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,
  provider      text,
  resource_id   text,
  resource_type text,
  actor_id      text,
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_events_agency_idx   ON travel_events(agency_id);
CREATE INDEX IF NOT EXISTS travel_events_type_idx     ON travel_events(event_type);
CREATE INDEX IF NOT EXISTS travel_events_provider_idx ON travel_events(provider);
CREATE INDEX IF NOT EXISTS travel_events_resource_idx ON travel_events(resource_id);

-- ── Provider Credentials ─────────────────────────────────────
-- credentials JSONB stores API keys — never returned to the client.
-- Unique constraint: one active credential per provider per agency.
CREATE TABLE IF NOT EXISTS provider_credentials (
  id            text        PRIMARY KEY,
  agency_id     text        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider_code text        NOT NULL,
  label         text,
  credentials   jsonb,
  is_active     boolean     NOT NULL DEFAULT true,
  tested_at     timestamptz,
  test_status   text,
  test_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_creds_agency_provider_uq
  ON provider_credentials(agency_id, provider_code);

-- ── Tickets ──────────────────────────────────────────────────
-- Operational entity — NOT financial.
-- ticket_number is NULL while status='pending'.
-- PostgreSQL NULLS DISTINCT (default): unique index allows multiple NULLs.
CREATE TABLE IF NOT EXISTS tickets (
  id                        text        PRIMARY KEY,
  agency_id                 text        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  pnr_id                    text        NOT NULL REFERENCES pnr_records(id),
  booking_id                text        REFERENCES bookings(id),
  customer_id               text        REFERENCES customers(id),
  credential_id             text        REFERENCES provider_credentials(id),
  issuing_provider          text,
  ticket_number             text,
  passenger_name            text        NOT NULL,
  issued_at                 timestamptz,
  expires_at                timestamptz,
  status                    text        NOT NULL DEFAULT 'pending',
  fare_halalas              integer     NOT NULL DEFAULT 0,
  tax_halalas               integer     NOT NULL DEFAULT 0,
  total_halalas             integer     NOT NULL DEFAULT 0,
  issued_by                 text,
  voided_at                 timestamptz,
  voided_by                 text,
  refunded_at               timestamptz,
  reconciliation_attempts   integer     NOT NULL DEFAULT 0,
  last_reconciliation_at    timestamptz,
  pending_operation_payload jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_agency_idx ON tickets(agency_id);
CREATE INDEX IF NOT EXISTS tickets_pnr_idx    ON tickets(pnr_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status);

-- NULLS DISTINCT (PostgreSQL default): multiple pending rows (ticket_number NULL) allowed.
-- Once a ticket_number is assigned it must be unique within the agency.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_number_uq
  ON tickets(agency_id, ticket_number);

-- ── Ticket Coupons ───────────────────────────────────────────
-- One row per flight segment per ticket.
-- segment_index maps into pnr_records.segments[n].
CREATE TABLE IF NOT EXISTS ticket_coupons (
  id            text        PRIMARY KEY,
  ticket_id     text        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  segment_index integer     NOT NULL,
  coupon_status text        NOT NULL DEFAULT 'open',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupons_ticket_idx ON ticket_coupons(ticket_id);
