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

  const expiredRows = await db
    .select({ id: pnrRecords.id, agencyId: pnrRecords.agencyId, gds: pnrRecords.gds })
    .from(pnrRecords)
    .where(and(
      eq(pnrRecords.status, 'active'),
      lt(pnrRecords.expiresAt, now),
      isNull(pnrRecords.deletedAt),
    ))
    .limit(100);

  if (expiredRows.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  const ids = expiredRows.map((r) => r.id);

  await db.update(pnrRecords)
    .set({ status: 'expired', updatedAt: now })
    .where(inArray(pnrRecords.id, ids));

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

  return NextResponse.json({ expired: ids.length });
}
