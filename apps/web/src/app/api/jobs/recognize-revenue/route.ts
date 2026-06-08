import { NextResponse } from 'next/server';
import { recognizeDueRevenue } from '@/lib/revenue-recognition';

// Recognises deferred travel revenue once the service date has passed:
//   Dr 3201 Deferred Revenue - Travel  →  Cr 4100 Revenue - Travel Services
// Authorization: Bearer ${CRON_SECRET}
// Production: CRON_SECRET is required — missing secret → 401 (fail closed)
// Development: unprotected when CRON_SECRET is unset
//
// On Vercel Hobby (max 2 daily crons) this route is also invoked once per day
// from within the reconcile-pending-tickets cron, so it runs automatically
// without consuming a third cron slot. It remains directly callable for manual
// triggering or for a dedicated cron once the plan is upgraded.
export async function GET(request: Request) {
  const secret = process.env['CRON_SECRET'];
  const isDev  = process.env['NODE_ENV'] !== 'production';

  if (!secret && !isDev) {
    console.error(JSON.stringify({ event: 'cron_misconfigured', route: 'recognize-revenue', reason: 'CRON_SECRET not set in production' }));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await recognizeDueRevenue(new Date());
    return NextResponse.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: 'recognize_revenue_cron_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
