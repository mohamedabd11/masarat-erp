/**
 * GET /api/hr/leave-balances?employeeId=&year=
 * Returns leave balance (annual + sick) for an employee in a given year.
 * If no balance row exists yet, returns defaults from active contract.
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveBalances, employeeContracts, employees } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'leave_management', db);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId');
    const year       = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId مطلوب' }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return NextResponse.json({ error: 'السنة غير صالحة' }, { status: 400 });
    }

    const [employee] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.agencyId, agencyId)))
      .limit(1);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

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
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
