import { NextResponse } from 'next/server';
import { recognizeDueRevenue } from '@/lib/revenue-recognition';
import { requireCronAuth } from '@/lib/cron-auth';

// Recognises deferred travel revenue once the service date has passed:
//   Dr 3201 Deferred Revenue - Travel  →  Cr 4100 Revenue - Travel Services
// Authorization: Bearer ${CRON_SECRET}
// CRON_SECRET is required in every environment — missing/invalid → 401 (fail closed)
//
// On Vercel Hobby (max 2 daily crons) this route is also invoked once per day
// from within the reconcile-pending-tickets cron, so it runs automatically
// without consuming a third cron slot. It remains directly callable for manual
// triggering or for a dedicated cron once the plan is upgraded.
export async function GET(request: Request) {
  const unauthorized = await requireCronAuth(request, 'recognize-revenue');
  if (unauthorized) return unauthorized;

  try {
    const result = await recognizeDueRevenue(new Date());
    return NextResponse.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: 'recognize_revenue_cron_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
