-- 0022 — Per-user section permissions + agency module toggles
--
-- DOCUMENTATION ONLY. The live schema sync is apps/web/src/instrumentation.ts
-- (drizzle-kit migrate/push are not run against DATABASE_URL). This file mirrors
-- those two idempotent statements for the migration history.
--
-- users.permissions: JSON array of feature keys a non-admin user may access
--   (section-level RBAC). NULL = full access — keeps every existing user and all
--   admins unrestricted. Enforced server-side in lib/api-auth.ts → verifyAuth.
-- agencies.enabled_modules: JSON array of business-line module ids the agency has
--   switched on (NULL = all). Drives the sidebar service-line items + modules tab.

ALTER TABLE users    ADD COLUMN IF NOT EXISTS permissions     TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS enabled_modules TEXT;
