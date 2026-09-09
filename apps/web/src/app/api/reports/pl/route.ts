import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { getProfitAndLoss } from '@/lib/profit-and-loss';
import { validateReportRange } from '@/lib/report-dates';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'financial_reports', db);
    const url = new URL(request.url);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!from || !to) {
      return NextResponse.json({ error: 'from و to مطلوبان (YYYY-MM-DD)' }, { status: 400 });
    }
    const validation = validateReportRange(from, to);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
    const result = await getProfitAndLoss(db, agencyId, { from, to });
    return NextResponse.json({
      from, to, revenue: result.revenue, expenses: result.expenses,
      totalRevenue: result.totalRevenue, totalExpenses: result.totalExpenses, netIncome: result.netIncome,
      ...(url.searchParams.get('groupBy') === 'serviceType' ? { byServiceType: result.byServiceType } : {}),
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'pl_report_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
