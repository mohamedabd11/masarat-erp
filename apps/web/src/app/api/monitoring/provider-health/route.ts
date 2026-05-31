import { NextResponse } from 'next/server';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { travelEvents } from '@/lib/schema/travel-events';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const PROVIDERS = ['amadeus', 'sabre', 'galileo', 'worldspan'] as const;

// GET /api/monitoring/provider-health
// Returns last success, last failure, and 24h sync success rate per provider.
// Read-only — shown in /settings?tab=providers. No charts, no retry queue.
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const [[lastSuccess], [lastFailure], [stats]] = await Promise.all([
          db
            .select({ createdAt: travelEvents.createdAt })
            .from(travelEvents)
            .where(and(
              eq(travelEvents.agencyId, agencyId),
              eq(travelEvents.provider, provider),
              eq(travelEvents.eventType, 'pnr_sync_completed'),
            ))
            .orderBy(desc(travelEvents.createdAt))
            .limit(1),

          db
            .select({ createdAt: travelEvents.createdAt })
            .from(travelEvents)
            .where(and(
              eq(travelEvents.agencyId, agencyId),
              eq(travelEvents.provider, provider),
              eq(travelEvents.eventType, 'pnr_sync_failed'),
            ))
            .orderBy(desc(travelEvents.createdAt))
            .limit(1),

          db
            .select({
              total:    sql<number>`count(*)`.mapWith(Number),
              successes: sql<number>`count(*) filter (where event_type = 'pnr_sync_completed')`.mapWith(Number),
            })
            .from(travelEvents)
            .where(and(
              eq(travelEvents.agencyId, agencyId),
              eq(travelEvents.provider, provider),
              gte(travelEvents.createdAt, since24h),
              sql`event_type in ('pnr_sync_started', 'pnr_sync_completed', 'pnr_sync_failed')`,
            )),
        ]);

        const total     = stats?.total     ?? 0;
        const successes = stats?.successes ?? 0;

        return {
          provider,
          lastSuccessAt:  lastSuccess?.createdAt ?? null,
          lastFailureAt:  lastFailure?.createdAt ?? null,
          syncs24h:       total,
          successes24h:   successes,
          successRate24h: total > 0 ? Math.round((successes / total) * 100) : null,
        };
      }),
    );

    return NextResponse.json({ providers: results, asOf: new Date().toISOString() });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
