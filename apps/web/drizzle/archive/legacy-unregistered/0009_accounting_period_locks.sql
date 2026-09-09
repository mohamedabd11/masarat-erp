-- Migration 0009: Accounting period locks

CREATE TABLE IF NOT EXISTS accounting_periods (
  id            text PRIMARY KEY,
  agency_id     text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  period_year   integer NOT NULL,
  period_month  integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  is_locked     boolean NOT NULL DEFAULT false,
  locked_at     timestamp,
  locked_by     text,
  notes         text,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounting_periods_agency_ym_uq
  ON accounting_periods(agency_id, period_year, period_month);
