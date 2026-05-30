import { NextResponse } from 'next/server';
import { eq, and, lt, isNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { logTravelEvent } from '@/lib/travel-event-log';

// Invoked by Vercel Cron every hour: "0 * * * *"
// Authorization: Bearer ${CRON_SECRET}
// If CRON_SECRET is unset → runs unprotected (local dev only)
export async function GET(request: Request) {
  const secret = process.env['CRON_SECRET'];
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

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
