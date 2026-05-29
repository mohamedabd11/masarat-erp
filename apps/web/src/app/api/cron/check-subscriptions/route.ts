/**
 * Cron: Daily subscription expiry check — runs at 08:00 UTC
 * يفحص الوكالات التي انتهت اشتراكاتها أو على وشك الانتهاء
 */
export const runtime = 'nodejs';

import { eq, lte, and, inArray } from 'drizzle-orm';
import { agencies } from '@masarat/database/schema';
import { getHttpClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('x-cron-secret') !== process.env['CRON_SECRET']) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = logger.child({ job: 'check-subscriptions' });
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead

  try {
    const db = getHttpClient();

    // Find agencies whose subscriptions have expired
    const expired = await db
      .select({ id: agencies.id, nameAr: agencies.nameAr })
      .from(agencies)
      .where(
        and(
          inArray(agencies.subscriptionStatus, ['active', 'trial']),
          lte(agencies.subscriptionEndsAt, now)
        )
      );

    // Mark expired agencies as past_due
    let suspendedCount = 0;
    for (const agency of expired) {
      await db
        .update(agencies)
        .set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
        .where(eq(agencies.id, agency.id));
      log.warn('Agency subscription expired — suspended', { agencyId: agency.id });
      suspendedCount++;
    }

    // Find agencies expiring within 7 days (still active — for alerting)
    const expiringSoon = await db
      .select({ id: agencies.id, nameAr: agencies.nameAr, subscriptionEndsAt: agencies.subscriptionEndsAt })
      .from(agencies)
      .where(
        and(
          eq(agencies.subscriptionStatus, 'active'),
          lte(agencies.subscriptionEndsAt, warningThreshold)
        )
      );

    log.info('Subscription check complete', {
      suspended: suspendedCount,
      expiringSoon: expiringSoon.length,
    });

    return Response.json({
      success: true,
      suspended: suspendedCount,
      expiringSoon: expiringSoon.length,
      expiringSoonIds: expiringSoon.map(a => a.id),
    });
  } catch (err) {
    log.error('Subscription check failed', {}, err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
