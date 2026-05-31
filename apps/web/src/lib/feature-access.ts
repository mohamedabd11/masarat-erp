/**
 * Server-side feature access checks — single-plan model.
 *
 * Every agency gets ALL features by default.
 * Access is blocked only when:
 *   1. Subscription is not active (expired / suspended)
 *   2. Admin has explicitly disabled a feature for this agency (overrideType = 'revoke')
 *
 * Override precedence:
 *   'revoke' in agency_features  → BLOCKED  (even on active subscription)
 *   no record / 'grant'          → ALLOWED  (if subscription active)
 *   subscription expired/suspended → BLOCKED (all features)
 */

import { eq, and } from 'drizzle-orm';
import { agencyFeatures, agencies } from '@/lib/schema';
import { BusinessError } from '@/lib/api-auth';
import type { db as DbType } from '@/lib/db';
import type { FeatureKey } from '@/lib/plan-features';

type AnyDb = typeof DbType | Parameters<Parameters<typeof DbType.transaction>[0]>[0];

/** Statuses that block all feature access. */
const BLOCKED_STATUSES = new Set(['expired', 'suspended', 'past_due', 'cancelled']);

// ─── Core check ───────────────────────────────────────────────────────────────

export async function checkFeature(
  agencyId: string,
  feature:  FeatureKey,
  db:       AnyDb,
): Promise<boolean> {
  const [agencyResult, overrideResult] = await Promise.allSettled([
    (db as typeof DbType)
      .select({ subscriptionStatus: agencies.subscriptionStatus })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1)
      .then(rows => rows[0]),

    (db as typeof DbType)
      .select({ overrideType: agencyFeatures.overrideType })
      .from(agencyFeatures)
      .where(and(
        eq(agencyFeatures.agencyId, agencyId),
        eq(agencyFeatures.featureKey, feature as string),
      ))
      .limit(1)
      .then(rows => rows[0]),
  ]);

  const agencyRow   = agencyResult.status   === 'fulfilled' ? agencyResult.value   : null;
  const overrideRow = overrideResult.status === 'fulfilled' ? overrideResult.value : null;

  if (!agencyRow) return false;

  const { subscriptionStatus } = agencyRow;

  // Blocked subscription → deny everything
  if (BLOCKED_STATUSES.has(subscriptionStatus ?? '')) return false;

  // Explicit revoke by admin → deny this specific feature
  if (overrideRow?.overrideType === 'revoke') return false;

  // Active / trial / lifetime → allow
  return true;
}

// ─── Guard helper ─────────────────────────────────────────────────────────────

export async function requireFeature(
  agencyId: string,
  feature:  FeatureKey,
  db:       AnyDb,
): Promise<void> {
  const allowed = await checkFeature(agencyId, feature, db);
  if (!allowed) {
    throw new BusinessError(
      `هذه الميزة (${feature}) غير متاحة — تواصل مع إدارة النظام لتفعيلها`,
      403,
    );
  }
}

// ─── Bulk fetch for UI ────────────────────────────────────────────────────────

export async function getAgencyFeatureOverrides(
  agencyId: string,
  db:       AnyDb,
): Promise<Array<{ featureKey: string; overrideType: string }>> {
  try {
    return await (db as typeof DbType)
      .select({
        featureKey:   agencyFeatures.featureKey,
        overrideType: agencyFeatures.overrideType,
      })
      .from(agencyFeatures)
      .where(eq(agencyFeatures.agencyId, agencyId));
  } catch {
    return [];
  }
}
