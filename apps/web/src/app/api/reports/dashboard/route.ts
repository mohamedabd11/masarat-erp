import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { dashboardPeriod } from '@/lib/reports-dashboard-model';
import { getDashboardReport } from '@/lib/reports-dashboard';

/** Agency-scoped summary: bookings, invoice documents and posted profit stay distinct. */
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'reports', db);
    let period;
    try {
      period = dashboardPeriod(new URL(request.url).searchParams.get('year'));
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    const report = await db.transaction(
      (tx) => getDashboardReport(tx as Pick<typeof db, 'select'>, agencyId, period),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'reports_dashboard_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
