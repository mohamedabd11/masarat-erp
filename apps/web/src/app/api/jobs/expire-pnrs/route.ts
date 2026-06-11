import { NextResponse } from 'next/server';
import { eq, and, lt, isNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { logTravelEvent } from '@/lib/travel-event-log';
import { requireCronAuth } from '@/lib/cron-auth';

// Invoked by Vercel Cron every hour: "0 * * * *"
// Authorization: Bearer ${CRON_SECRET}
// CRON_SECRET is required in every environment — missing/invalid → 401 (fail closed)
export async function GET(request: Request) {
  const unauthorized = await requireCronAuth(request, 'expire-pnrs');
  if (unauthorized) return unauthorized;

  const now = new Date();

  // Drain the full backlog in batches instead of a single 100-row cap — at scale
  // a fixed cap can never keep up and leaves expired PNRs in 'active' (still
  // issuable). Bounded by a wall-clock budget and a hard batch limit so the
  // serverless invocation always terminates; any remainder is cleared next run.
  const BATCH       = 500;
  const MAX_BATCHES = 50;          // ≤ 25k PNRs per invocation
  const DEADLINE_MS = 25_000;      // stay well under the platform timeout
  const startedAt   = Date.now();

  let totalExpired = 0;
  let more         = false;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const expiredRows = await db
      .select({ id: pnrRecords.id, agencyId: pnrRecords.agencyId, gds: pnrRecords.gds })
      .from(pnrRecords)
      .where(and(
        eq(pnrRecords.status, 'active'),
        lt(pnrRecords.expiresAt, now),
        isNull(pnrRecords.deletedAt),
      ))
      .limit(BATCH);

    if (expiredRows.length === 0) break;

    const ids = expiredRows.map((r) => r.id);
    await db.update(pnrRecords)
      .set({ status: 'expired', updatedAt: now })
      .where(inArray(pnrRecords.id, ids));

    totalExpired += ids.length;

    // Non-blocking travel events — one per PNR for queryability
    for (const row of expiredRows) {
      void logTravelEvent({
        agencyId:     row.agencyId,
        eventType:    'pnr_expired',
        provider:     row.gds ?? undefined,
        resourceId:   row.id,
        resourceType: 'pnr',
        actorId:      'system',
      });
    }

    if (ids.length < BATCH) break;                 // backlog cleared
    if (Date.now() - startedAt > DEADLINE_MS) { more = true; break; }
    if (batch === MAX_BATCHES - 1) more = true;    // hit the hard cap
  }

  return NextResponse.json({ expired: totalExpired, more });
}
