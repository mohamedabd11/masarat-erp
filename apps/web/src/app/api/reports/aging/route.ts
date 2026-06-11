import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAgingReport } from '@/lib/ar-aging';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const url        = new URL(request.url);
    const asOfParam  = url.searchParams.get('asOf');
    const filterCust = url.searchParams.get('customerId');

    // Validate asOf — default to today
    const asOf = asOfParam ? new Date(asOfParam + 'T00:00:00Z') : new Date();
    if (isNaN(asOf.getTime())) {
      return NextResponse.json({ error: 'asOf يجب أن يكون تاريخاً صالحاً (YYYY-MM-DD)' }, { status: 400 });
    }
    const asOfStr = asOf.toISOString().split('T')[0]!;

    const report = await getAgingReport(db, agencyId, asOfStr, filterCust);

    return NextResponse.json({ asOf: asOfStr, ...report });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'aging_report_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
