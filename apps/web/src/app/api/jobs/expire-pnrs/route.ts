/**
 * GET /api/jobs/expire-pnrs
 *
 * Vercel Cron Job — runs every hour (see vercel.json).
 *
 * Finds PNR records where:
 *   status = 'active'  AND  expires_at < NOW()  AND  deleted_at IS NULL
 *
 * Transitions them to status = 'expired' and fires a pnr_expired travel event
 * for each one. Processes up to BATCH_SIZE records per invocation; if more
 * exist they will be caught on the next hourly run.
 *
 * Security: protected by CRON_SECRET env var (set in Vercel project settings).
 * Vercel automatically sends the secret in the Authorization header for crons.
 * Without the env var the route runs unprotected — only acceptable in local dev.
 */
import { NextResponse } from 'next/server';
import { lt, and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { logTravelEvent } from '@/lib/travel-event-log';

const BATCH_SIZE = 100;

export async function GET(request: Request) {
  // Verify Vercel cron secret when configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const now = new Date();

    // Select active PNRs whose expiry has passed
    const toExpire = await db
      .select({
        id:       pnrRecords.id,
        pnrCode:  pnrRecords.pnrCode,
        gds:      pnrRecords.gds,
        agencyId: pnrRecords.agencyId,
      })
      .from(pnrRecords)
      .where(and(
        isNull(pnrRecords.deletedAt),
        eq(pnrRecords.status, 'active'),
        lt(pnrRecords.expiresAt, now),
      ))
      .limit(BATCH_SIZE);

    if (toExpire.length === 0) {
      return NextResponse.json({ expired: 0 });
    }

    const ids = toExpire.map(r => r.id);

    // Single batch UPDATE — avoids N individual round-trips
    await db.update(pnrRecords)
      .set({ status: 'expired', updatedAt: now })
      .where(inArray(pnrRecords.id, ids));

    // Fire individual travel events for auditability (non-blocking)
    for (const pnr of toExpire) {
      void logTravelEvent({
        agencyId:     pnr.agencyId,
        eventType:    'pnr_expired',
        provider:     pnr.gds ?? 'system',
        resourceId:   pnr.id,
        resourceType: 'pnr',
        payload:      { pnrCode: pnr.pnrCode, expiredAt: now.toISOString() },
      });
    }

    console.log(JSON.stringify({
      event:   'expire_pnrs_job',
      expired: toExpire.length,
      at:      now.toISOString(),
    }));

    return NextResponse.json({ expired: toExpire.length });
  } catch (err) {
    console.error(JSON.stringify({ event: 'expire_pnrs_job_failed', error: String(err) }));
    return NextResponse.json({ error: 'Job failed' }, { status: 500 });
  }
}
