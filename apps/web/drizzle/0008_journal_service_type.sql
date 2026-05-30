-- Migration 0008: Service type tagging on journal entries for P&L by product

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS service_type text;

CREATE INDEX IF NOT EXISTS journal_entries_service_type_idx ON journal_entries(agency_id, service_type);
