/**
 * Plan rank table.
 * Higher rank = more features.
 * trial & lifetime get everything (rank 10).
 */
export const PLAN_RANK: Record<string, number> = {
  '':           0,
  starter:      1,
  professional: 2,
  lifetime:    10,
  trial:       10,   // trial period = all features
  super_admin: 10,
};

/**
 * Minimum plan rank each feature requires.
 * rank 1 = starter+   rank 2 = professional+
 */
export const FEATURE_MIN_RANK = {
  // ── Starter tier (all paid plans) ──────────────────────────────────────────
  dashboard:         1,
  bookings:          1,
  customers:         1,
  suppliers:         1,
  invoices:          1,
  quotes:            1,
  payments:          1,
  settings:          1,
  help:              1,

  // ── Professional tier ──────────────────────────────────────────────────────
  receipt_vouchers:  2,
  supplier_payments: 2,
  cheques:           2,
  banking:           2,
  accounting:        2,
  employees:         2,
  reports:           2,
} as const;

export type FeatureKey = keyof typeof FEATURE_MIN_RANK;

/** Returns true if the given plan string can access the requested feature. */
export function planCanAccess(plan: string, feature: FeatureKey): boolean {
  return (PLAN_RANK[plan] ?? 0) >= FEATURE_MIN_RANK[feature];
}
