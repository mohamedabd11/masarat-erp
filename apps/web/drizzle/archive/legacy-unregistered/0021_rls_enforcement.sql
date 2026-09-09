-- Activate Row-Level Security tenant isolation (audit item 4-a-1).
--
-- Supersedes 0016_rls_agency_isolation.sql, whose `bypass_for_service_role`
-- PERMISSIVE policy (USING true, TO CURRENT_USER) silently negated every RLS
-- policy. Two changes are required to make RLS actually enforce:
--
--   1. DROP the bypass policy.
--   2. FORCE ROW LEVEL SECURITY — the application connects as the table OWNER,
--      and a table owner bypasses RLS unless FORCE is set.
--
-- The agency_isolation policy is FAIL-OPEN: when no `app.current_agency_id` is
-- set (cron jobs, super-admin, auth/setup routes, and any bare query not yet
-- converted to a transaction) every row is visible — preserving prior behaviour.
-- When a context IS set — db.transaction() within an authenticated request sets
-- it from AsyncLocalStorage (see src/lib/db.ts + src/lib/tenant-context.ts,
-- populated by verifyAuth) — access is restricted to that agency.
--
-- Data-driven over every public table carrying an agency_id, so present and
-- future tenant tables are covered automatically. idempotency_keys is excluded
-- (its agency_id is nullable; strict equality would hide its NULL-agency rows
-- and block context-scoped inserts).
--
-- NOTE: The live database is migrated by src/instrumentation.ts (boot-time
-- idempotent SQL), which carries an identical block. This file mirrors it for
-- the drizzle history / manual `drizzle-kit migrate` path. It is idempotent and
-- atomic: if any table errors the whole block rolls back, so no table is ever
-- left RLS-forced without its policy.

DO $rls$
  DECLARE t text;
  BEGIN
    FOR t IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = 'agency_id'
        AND tb.table_type = 'BASE TABLE'
        AND c.table_name <> 'idempotency_keys'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS bypass_for_service_role ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS agency_isolation ON public.%I', t);
      EXECUTE format($pol$
        CREATE POLICY agency_isolation ON public.%I AS PERMISSIVE FOR ALL
        USING (
          current_setting('app.current_agency_id', true) IS NULL
          OR current_setting('app.current_agency_id', true) = ''
          OR agency_id = current_setting('app.current_agency_id', true)
        )
      $pol$, t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END
$rls$;
