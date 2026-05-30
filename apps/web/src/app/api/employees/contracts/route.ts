import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employeeContracts, employees } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;

    const conditions = [eq(employeeContracts.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(employeeContracts.employeeId, employeeId));

    const rows = await db
      .select()
      .from(employeeContracts)
      .where(and(...conditions))
      .orderBy(desc(employeeContracts.startDate));

    return NextResponse.json({ contracts: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as {
      employeeId:                string;
      contractNumber?:           string;
      type?:                     string;
      startDate:                 string;
      endDate?:                  string;
      baseSalaryHalalas:         number;
      housingAllowanceHalalas?:  number;
      transportAllowanceHalalas?: number;
      otherAllowancesHalalas?:   number;
      salaryComponents?:         unknown;
      workingDaysPerWeek?:       number;
      workingHoursPerDay?:       number;
      annualLeaveDays?:          number;
      notes?:                    string;
    };

    if (!body.employeeId || !body.startDate) {
      return NextResponse.json({ error: 'employeeId و startDate مطلوبان' }, { status: 400 });
    }

    // Verify employee belongs to this agency
    const [emp] = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)));
    if (!emp) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    const id             = crypto.randomUUID();
    const contractNumber = body.contractNumber ?? `CT-${Date.now()}`;
    const VALID_TYPES = new Set(['full_time', 'part_time', 'contract', 'intern']);
    const type = body.type ?? 'full_time';
    if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'نوع العقد غير صالح' }, { status: 400 });

    await db.insert(employeeContracts).values({
      id,
      agencyId,
      employeeId:                body.employeeId,
      contractNumber,
      type,
      startDate:                 body.startDate,
      endDate:                   body.endDate                   ?? null,
      baseSalaryHalalas:         body.baseSalaryHalalas,
      housingAllowanceHalalas:   body.housingAllowanceHalalas   ?? 0,
      transportAllowanceHalalas: body.transportAllowanceHalalas ?? 0,
      otherAllowancesHalalas:    body.otherAllowancesHalalas    ?? 0,
      salaryComponents:          (body.salaryComponents         ?? null) as never,
      workingDaysPerWeek:        body.workingDaysPerWeek        ?? 5,
      workingHoursPerDay:        body.workingHoursPerDay        ?? 8,
      annualLeaveDays:           body.annualLeaveDays           ?? 21,
      notes:                     body.notes                     ?? null,
      createdBy:                 uid,
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'employee_contract', resourceId: id, after: { employeeId: body.employeeId, contractNumber } });
    return NextResponse.json({ success: true, id, contractNumber });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
