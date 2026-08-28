import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAgingReport } from '@/lib/ar-aging';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { isStrictIsoDate, todayIsoDate } from '@/lib/report-dates';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const url        = new URL(request.url);
    const asOfParam  = url.searchParams.get('asOf');
    const filterCust = url.searchParams.get('customerId');

    if (asOfParam && !isStrictIsoDate(asOfParam)) {
      return NextResponse.json({ error: 'asOf يجب أن يكون تاريخاً صحيحاً بصيغة YYYY-MM-DD' }, { status: 400 });
    }
    const asOfStr = asOfParam ?? todayIsoDate();

    const report = await getAgingReport(db, agencyId, asOfStr, filterCust);

    const detailSnapshotDate = todayIsoDate();
    return NextResponse.json({
      asOf: asOfStr,
      detailSnapshotDate,
      historicalDetailAvailable: asOfStr === detailSnapshotDate,
      ...report,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'aging_report_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
