import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant context.
 *
 * `verifyAuth()` stores the authenticated user's agencyId here; `db.transaction()`
 * (see ./db) reads it and issues `SELECT set_config('app.current_agency_id', …)`
 * at the start of every transaction, activating the PostgreSQL RLS policies
 * created in instrumentation.ts.
 *
 * This is defense-in-depth: even if a query forgets its manual `WHERE agency_id`,
 * RLS prevents cross-tenant rows from being read or written. When no context is
 * set (cron jobs, super-admin, auth/setup routes) the RLS policies are fail-open,
 * so those paths keep working unchanged.
 */
interface TenantStore {
  agencyId: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Bind the current request's agency context. Uses `enterWith` so the value
 * persists for the remainder of the request handler after `verifyAuth()` returns
 * (each API request runs in its own async context). A blank agencyId — e.g. a
 * super-admin with no agency — is ignored, leaving RLS fail-open.
 */
export function setTenantContext(agencyId: string): void {
  if (agencyId) storage.enterWith({ agencyId });
}

/** The current request's agencyId, or undefined when no context is bound. */
export function getTenantAgencyId(): string | undefined {
  return storage.getStore()?.agencyId;
}

/** Run `fn` inside an explicit tenant scope (useful for jobs/tests). */
export function runWithTenant<T>(agencyId: string, fn: () => T): T {
  return storage.run({ agencyId }, fn);
}
