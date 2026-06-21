/**
 * Per-user, section-level permissions (RBAC).
 *
 * Two enforcement points share this module as the single source of truth:
 *   1. Server — verifyAuth (lib/api-auth.ts) maps each request path to a feature
 *      via featureForPath() and denies (403) if the user lacks it. This is the
 *      REAL security gate; the UI is cosmetic on top of it.
 *   2. Client — SubscriptionProvider.canAccess() hides sidebar items the user
 *      cannot reach.
 *
 * Model:
 *   • A user's `permissions` column is a JSON array of FeatureKey, or NULL.
 *   • NULL  → full access (every legacy user + admins stay unrestricted).
 *   • owner / admin role → always full access, regardless of the column.
 *   • COMMON_FEATURES are always allowed (app shell: dashboard / settings / help).
 *   • Otherwise the user may reach a feature only if it is in their array.
 */

import { FEATURE_GROUPS, ALL_FEATURES, type FeatureKey } from './plan-features';

// ─── Roles that always have full access (cannot be section-restricted) ──────────

const FULL_ACCESS_ROLES = new Set(['owner', 'admin']);

export function roleHasFullAccess(role: string | undefined | null): boolean {
  return !!role && FULL_ACCESS_ROLES.has(role);
}

// ─── Always-on features (app shell — never section-gated) ───────────────────────

export const COMMON_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  'dashboard', 'settings', 'help',
]);

// ─── Features that an admin may grant/revoke per user, grouped for the UI ───────
// Derived from FEATURE_GROUPS minus the core shell and non-section infra keys.

// Excluded from the per-user picker because they are not independently gated:
//   • core shell (dashboard/settings/help) is always available;
//   • advanced_permissions/api_access are infra, not user sections;
//   • journal_entries/chart_of_accounts/financial_reports are sub-areas of
//     'accounting' (every accounting/* route gates on 'accounting'), so exposing
//     them as separate checkboxes would not match enforcement.
const NON_ASSIGNABLE = new Set<FeatureKey>([
  'dashboard', 'settings', 'help', 'advanced_permissions', 'api_access',
  'journal_entries', 'chart_of_accounts', 'financial_reports',
]);

export const PERMISSION_GROUPS: { key: string; ar: string; en: string; features: FeatureKey[] }[] =
  FEATURE_GROUPS
    .filter(g => g.key !== 'core')
    .map(g => ({
      key: g.key,
      ar: g.ar,
      en: g.en,
      features: g.features.filter(f => !NON_ASSIGNABLE.has(f)),
    }))
    .filter(g => g.features.length > 0);

export const ASSIGNABLE_FEATURES: FeatureKey[] = PERMISSION_GROUPS.flatMap(g => g.features);

const ASSIGNABLE_SET = new Set<FeatureKey>(ASSIGNABLE_FEATURES);

export function isAssignableFeature(key: string): key is FeatureKey {
  return ASSIGNABLE_SET.has(key as FeatureKey);
}

// ─── Role presets — pre-fill the checkboxes when inviting a user ────────────────
// 'all' = every assignable feature (the admin can then trim it down).

export const ROLE_PRESETS: Record<string, FeatureKey[] | 'all'> = {
  owner:      'all',
  admin:      'all',
  manager:    'all',
  // Accountant — finance sections only.
  accountant: PERMISSION_GROUPS.find(g => g.key === 'finance')?.features ?? [],
  // Agent — day-to-day operations.
  agent:      PERMISSION_GROUPS.find(g => g.key === 'operations')?.features ?? [],
  // Viewer — can see everything (read-only is enforced separately by assertRole).
  viewer:     'all',
  staff:      PERMISSION_GROUPS.find(g => g.key === 'operations')?.features ?? [],
};

export function presetFeatures(role: string): FeatureKey[] {
  const preset = ROLE_PRESETS[role];
  if (preset === 'all') return [...ASSIGNABLE_FEATURES];
  return preset ? [...preset] : [];
}

// ─── Parsing / validation ───────────────────────────────────────────────────────

/** Parse the stored JSON column. NULL/invalid → null (= full access). */
export function parsePermissions(raw: string | null | undefined): FeatureKey[] | null {
  if (raw == null) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter((k): k is FeatureKey => typeof k === 'string' && isAssignableFeature(k));
  } catch {
    return null;
  }
}

/** Keep only valid assignable keys, de-duplicated. */
export function sanitizePermissions(keys: unknown): FeatureKey[] {
  if (!Array.isArray(keys)) return [];
  const seen = new Set<FeatureKey>();
  for (const k of keys) {
    if (typeof k === 'string' && isAssignableFeature(k)) seen.add(k);
  }
  return [...seen];
}

// ─── The core check ─────────────────────────────────────────────────────────────

export function userHasFeature(
  role: string | undefined | null,
  permissions: FeatureKey[] | null,
  feature: FeatureKey,
): boolean {
  if (roleHasFullAccess(role)) return true;
  if (COMMON_FEATURES.has(feature)) return true;
  if (permissions === null) return true;          // unrestricted (legacy / NULL)
  return permissions.includes(feature);
}

// ─── Path → feature map (server-side gate) ──────────────────────────────────────
//
// Each rule maps an /api path prefix to the feature it belongs to, or null when
// the route is common app infrastructure that must stay reachable by everyone
// (app shell, auth, notifications, dashboard widgets, shared lookups).
//
// ORDER MATTERS: more-specific prefixes must come before their parents.
// Routes that never call verifyAuth (admin/*, jobs/*, setup-db) are listed too,
// mapped to null, so the coverage test can assert every route is classified.

type Rule = [prefix: string, feature: FeatureKey | null];

const ROUTE_RULES: Rule[] = [
  // ── Common app infrastructure (no per-user gate) ──
  ['users',                       null],
  ['auth',                        null],
  ['notifications',               null],
  ['dashboard',                   null],
  ['reports/dashboard',           null],
  ['health',                      null],
  ['documents',                   null],
  ['service-types',               null],
  ['agencies/my-features',        null],
  ['agencies/zatca',              'vat'],
  ['settings/providers',          'providers'],
  ['settings',                    null],
  // ── Admin / cron (own auth — never hit the gate; classified for coverage) ──
  ['admin',                       null],
  ['jobs',                        null],
  ['setup-db',                    null],
  // ── Operations ──
  ['bookings',                    'bookings'],
  ['group-trips',                 'bookings'],
  ['appointments',                'bookings'],
  ['quotes',                      'quotes'],
  ['customers',                   'customers'],
  ['suppliers',                   'suppliers'],
  ['pnr',                         'pnr'],
  ['tickets',                     'tickets'],
  ['monitoring/provider-health',  'providers'],
  ['monitoring/tickets',          'tickets'],
  ['monitoring',                  'tickets'],
  ['bsp',                         'tickets'],
  // ── Finance ──
  ['invoices',                    'invoices'],
  ['recurring-invoices',          'invoices'],
  ['refunds',                     'invoices'],
  ['payments',                    'payments'],
  ['receipts',                    'receipt_vouchers'],
  ['supplier-payments',           'supplier_payments'],
  ['cheques',                     'cheques'],
  ['banking',                     'banking'],
  ['accounting',                  'accounting'],
  ['audit-log',                   'audit_logs'],
  ['reports',                     'reports'],
  // ── HR / Payroll (most-specific first) ──
  ['salary-payments',             'payroll'],
  ['employees/payslips',          'payroll'],
  ['employees/eosb',              'payroll'],
  ['employees/advances',          'payroll'],
  ['employees/attendance',        'attendance'],
  ['employees/shifts',            'attendance'],
  ['employees/contracts',         'contracts'],
  ['employees',                   'employees'],
  ['hr/leave-balances',           'leave_management'],
  ['leave-requests',              'leave_management'],
  ['hr',                          'hr'],
];

/**
 * Resolve the feature that gates a given request path.
 * Returns null for common/infra routes (always allowed for any authed user).
 * `matched` is false when no rule applied — used by the coverage test.
 */
export function featureForPath(pathname: string): { feature: FeatureKey | null; matched: boolean } {
  // Normalise: strip origin, leading slash, /api/ prefix, trailing slash.
  let p = pathname;
  const apiIdx = p.indexOf('/api/');
  if (apiIdx >= 0) p = p.slice(apiIdx + 5);
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');

  for (const [prefix, feature] of ROUTE_RULES) {
    if (p === prefix || p.startsWith(prefix + '/')) {
      return { feature, matched: true };
    }
  }
  return { feature: null, matched: false };
}

// ─── Agency business-line modules (settings → modules tab) ──────────────────────
// Distinct from per-user permissions: these are the service lines an agency works
// in. NULL = all enabled. `core` modules cannot be turned off.

export interface AgencyModule { id: string; core?: boolean; }

export const AGENCY_MODULES: AgencyModule[] = [
  { id: 'bookings',  core: true },
  { id: 'customers', core: true },
  { id: 'flights' },
  { id: 'hotels' },
  { id: 'packages' },
  { id: 'umrah' },
  { id: 'insurance' },
  { id: 'visas' },
  { id: 'transfers' },
];

const MODULE_IDS = new Set(AGENCY_MODULES.map(m => m.id));
const CORE_MODULE_IDS = new Set(AGENCY_MODULES.filter(m => m.core).map(m => m.id));

export function parseEnabledModules(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter((k): k is string => typeof k === 'string' && MODULE_IDS.has(k));
  } catch {
    return null;
  }
}

/** Validate a module-id list for persistence; core modules are always included. */
export function sanitizeEnabledModules(ids: unknown): string[] {
  const seen = new Set<string>(CORE_MODULE_IDS);
  if (Array.isArray(ids)) {
    for (const k of ids) if (typeof k === 'string' && MODULE_IDS.has(k)) seen.add(k);
  }
  return [...seen];
}

/** Whether a module is enabled. NULL list = all enabled; core always enabled. */
export function moduleEnabled(enabled: string[] | null, id: string): boolean {
  if (CORE_MODULE_IDS.has(id)) return true;
  if (enabled === null) return true;
  return enabled.includes(id);
}

// Re-export for convenience.
export type { FeatureKey };
export { ALL_FEATURES };
