-- Migration 0004: Attendance records, shifts, SMTP settings

-- SMTP columns on agencies
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_host        text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_port        integer;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_user        text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_password    text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_from_name   text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_from_email  text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS smtp_encryption  text DEFAULT 'tls';

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id            text PRIMARY KEY,
  agency_id     text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name_ar       text NOT NULL,
  name_en       text,
  start_time    text NOT NULL,
  end_time      text NOT NULL,
  days_of_week  jsonb,
  is_default    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shifts_agency_idx ON shifts(agency_id);

-- Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
  id                text PRIMARY KEY,
  agency_id         text NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id       text NOT NULL REFERENCES employees(id),
  shift_id          text,
  date              text NOT NULL,
  check_in          timestamp,
  check_out         timestamp,
  status            text NOT NULL DEFAULT 'present',
  work_minutes      integer DEFAULT 0,
  overtime_minutes  integer DEFAULT 0,
  notes             text,
  created_by        text,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_date_uq ON attendance_records(employee_id, date);
CREATE INDEX IF NOT EXISTS attendance_agency_date_idx ON attendance_records(agency_id, date);
