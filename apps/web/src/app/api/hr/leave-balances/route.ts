/**
 * GET /api/hr/leave-balances?employeeId=&year=
 * Returns leave balance (annual + sick) for an employee in a given year.
 * If no balance row exists yet, returns defaults from active contract.
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveBalances, employeeContracts } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId');
    const year       = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId مطلوب' }, { status: 400 });
    }

    const [bal] = await db
      .select()
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.year, year),
        eq(leaveBalances.agencyId, agencyId),
      ))
      .limit(1);

    if (bal) {
      return NextResponse.json({
        balance: {
          ...bal,
          annualRemaining: bal.annualEntitled - bal.annualUsed,
          sickRemaining:   bal.sickEntitled   - bal.sickUsed,
        },
      });
    }

    // No row yet — derive from active contract
    const [contract] = await db
      .select({ annualLeaveDays: employeeContracts.annualLeaveDays })
      .from(employeeContracts)
      .where(and(
        eq(employeeContracts.employeeId, employeeId),
        eq(employeeContracts.agencyId, agencyId),
        eq(employeeContracts.status, 'active'),
      ))
      .limit(1);

    const annualEntitled = contract?.annualLeaveDays ?? 21;
    return NextResponse.json({
      balance: {
        employeeId,
        year,
        annualEntitled,
        annualUsed:      0,
        annualRemaining: annualEntitled,
        sickEntitled:    30,
        sickUsed:        0,
        sickRemaining:   30,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
