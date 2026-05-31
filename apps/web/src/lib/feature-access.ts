/**
 * Server-side feature access checks.
 *
 * Call requireFeature() at the top of any API route that needs protection.
 * It merges plan-level access with per-agency overrides from agency_features.
 *
 * Override precedence (highest wins):
 *   'revoke' override  → false  (even if plan allows it)
 *   'grant'  override  → true   (even if plan doesn't include it)
 *   plan rank          → planCanAccess()
 */
import { eq, and } from 'drizzle-orm';
import { agencyFeatures, agencies } from '@/lib/schema';
import { planCanAccess, type FeatureKey } from '@/lib/plan-features';
import { BusinessError } from '@/lib/api-auth';
import type { db as DbType } from '@/lib/db';

type AnyDb = typeof DbType | Parameters<Parameters<typeof DbType.transaction>[0]>[0];

// ─── Core check ───────────────────────────────────────────────────────────────

/**
 * Returns true if the agency can access the feature.
 * Fetches the agency's plan + any per-agency override from the DB.
 */
export async function checkFeature(
  agencyId: string,
  feature:  FeatureKey,
  db:       AnyDb,
): Promise<boolean> {
  const [agencyRow, overrideRow] = await Promise.all([
    (db as typeof DbType)
      .select({ plan: agencies.plan, subscriptionStatus: agencies.subscriptionStatus })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1)
      .then(rows => rows[0]),

    (db as typeof DbType)
      .select({ overrideType: agencyFeatures.overrideType })
      .from(agencyFeatures)
      .where(and(
        eq(agencyFeatures.agencyId, agencyId),
        eq(agencyFeatures.featureKey, feature),
      ))
      .limit(1)
      .then(rows => rows[0]),
  ]);

  if (!agencyRow) return false;

  // Per-agency override takes precedence
  if (overrideRow?.overrideType === 'revoke') return false;
  if (overrideRow?.overrideType === 'grant')  return true;

  // Fall back to plan-level check
  const { plan, subscriptionStatus } = agencyRow;
  if (subscriptionStatus === 'lifetime' || subscriptionStatus === 'trial') return true;
  return planCanAccess(plan ?? '', feature);
}

// ─── Guard helper ─────────────────────────────────────────────────────────────

/**
 * Throws BusinessError(403) if the feature is not enabled for the agency.
 * Use at the top of API routes after verifyAuth():
 *
 *   await requireFeature(agencyId, 'accounting', db);
 */
export async function requireFeature(
  agencyId: string,
  feature:  FeatureKey,
  db:       AnyDb,
): Promise<void> {
  const allowed = await checkFeature(agencyId, feature, db);
  if (!allowed) {
    throw new BusinessError(
      `هذه الميزة (${feature}) غير متاحة ضمن اشتراكك الحالي — تواصل مع فريق المبيعات للترقية`,
      403,
    );
  }
}

// ─── Bulk fetch for UI ────────────────────────────────────────────────────────

/**
 * Returns all agency_features overrides for a given agency.
 * Used by SubscriptionProvider and the Admin Features panel.
 */
export async function getAgencyFeatureOverrides(
  agencyId: string,
  db:       AnyDb,
): Promise<Array<{ featureKey: string; overrideType: string }>> {
  return (db as typeof DbType)
    .select({
      featureKey:   agencyFeatures.featureKey,
      overrideType: agencyFeatures.overrideType,
    })
    .from(agencyFeatures)
    .where(eq(agencyFeatures.agencyId, agencyId));
}
