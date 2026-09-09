import { NextResponse } from 'next/server';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employeeContracts, employees, employeeTerminations } from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_ADMIN_ONLY, assertRole, verifyAuth } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isIsoDate } from '@/lib/hr-validation';
import { calculateTerminationSettlement, type TerminationType } from '@/lib/eosb';
import { logAudit } from '@/lib/audit';

const TERMINATION_TYPES = new Set<TerminationType>(['contract_end', 'employer', 'resignation', 'article_80', 'article_87', 'force_majeure', 'other']);

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'payroll', db);
    const employeeId = new URL(request.url).searchParams.get('employeeId');
    const conditions = [eq(employeeTerminations.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(employeeTerminations.employeeId, employeeId));
    const rows = await db.select().from(employeeTerminations)
      .where(and(...conditions)).orderBy(desc(employeeTerminations.createdAt));
    return NextResponse.json({ terminations: rows });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'payroll', db);
    const body = await request.json() as {
      employeeId?: string;
      terminationDate?: string;
      terminationType?: TerminationType;
      reason?: string;
    };
    if (!body.employeeId || !body.terminationDate || !isIsoDate(body.terminationDate)) {
      return NextResponse.json({ error: 'الموظف وتاريخ نهاية الخدمة الصحيح مطلوبان' }, { status: 400 });
    }
    if (!body.terminationType || !TERMINATION_TYPES.has(body.terminationType)) {
      return NextResponse.json({ error: 'نوع نهاية الخدمة غير صالح' }, { status: 400 });
    }
    if (['article_80', 'other'].includes(body.terminationType) && !body.reason?.trim()) {
      return NextResponse.json({ error: 'يجب توثيق سبب نهاية الخدمة لهذا النوع' }, { status: 400 });
    }
    const [[employee], [contract]] = await Promise.all([
      db.select({ id: employees.id, hireDate: employees.hireDate, salary: employees.salaryHalalas })
        .from(employees).where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId))).limit(1),
      db.select({
        base: employeeContracts.baseSalaryHalalas, housing: employeeContracts.housingAllowanceHalalas,
        transport: employeeContracts.transportAllowanceHalalas, other: employeeContracts.otherAllowancesHalalas,
      }).from(employeeContracts).where(and(
        eq(employeeContracts.agencyId, agencyId), eq(employeeContracts.employeeId, body.employeeId),
        lte(employeeContracts.startDate, body.terminationDate),
        or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, body.terminationDate)),
      )).orderBy(desc(employeeContracts.startDate)).limit(1),
    ]);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    if (!employee.hireDate) return NextResponse.json({ error: 'يجب تسجيل تاريخ تعيين الموظف أولاً' }, { status: 422 });
    if (body.terminationDate < employee.hireDate) return NextResponse.json({ error: 'تاريخ نهاية الخدمة يسبق تاريخ التعيين' }, { status: 422 });
    const lastWage = contract ? contract.base + contract.housing + contract.transport + contract.other : employee.salary;
    if (lastWage <= 0) return NextResponse.json({ error: 'يجب تسجيل آخر أجر للموظف قبل التسوية' }, { status: 422 });
    const calculation = calculateTerminationSettlement(lastWage, employee.hireDate, body.terminationDate, body.terminationType);
    const id = crypto.randomUUID();
    await db.insert(employeeTerminations).values({
      id, agencyId, employeeId: employee.id, terminationDate: body.terminationDate,
      terminationType: body.terminationType, reason: body.reason?.trim() || null,
      lastWageHalalas: lastWage, baseBenefitHalalas: calculation.baseBenefitHalalas,
      entitlementRateBps: calculation.entitlementRateBps, settlementHalalas: calculation.settlementHalalas,
      createdBy: uid,
    });
    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'employee_termination', resourceId: id, after: { ...body, ...calculation } });
    return NextResponse.json({ success: true, id, ...calculation }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'توجد تسوية نهاية خدمة مفتوحة لهذا الموظف' }, { status: 409 });
    }
    console.error(JSON.stringify({ event: 'employee_termination_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
