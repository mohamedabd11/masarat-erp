import { NextResponse } from 'next/server';
import { eq, and, desc, lte, gte, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employeeContracts, employees } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { isIsoDate, isNonNegativeInteger } from '@/lib/hr-validation';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'contracts', db);
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
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'contracts', db);

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
    if (!isIsoDate(body.startDate) || (body.endDate && !isIsoDate(body.endDate))) {
      return NextResponse.json({ error: 'تاريخ العقد غير صالح' }, { status: 400 });
    }
    if (body.endDate && body.endDate < body.startDate) {
      return NextResponse.json({ error: 'تاريخ نهاية العقد لا يمكن أن يسبق تاريخ بدايته' }, { status: 400 });
    }
    const moneyInputs = [body.baseSalaryHalalas, body.housingAllowanceHalalas ?? 0,
      body.transportAllowanceHalalas ?? 0, body.otherAllowancesHalalas ?? 0];
    if (!moneyInputs.every(isNonNegativeInteger) || !Number.isSafeInteger(body.baseSalaryHalalas) || body.baseSalaryHalalas <= 0) {
      return NextResponse.json({ error: 'مبالغ العقد يجب أن تكون أرقاماً صحيحة غير سالبة والراتب الأساسي موجب' }, { status: 400 });
    }
    const workingDays = body.workingDaysPerWeek ?? 5;
    const workingHours = body.workingHoursPerDay ?? 8;
    const annualLeaveDays = body.annualLeaveDays ?? 21;
    if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 7
      || !Number.isInteger(workingHours) || workingHours < 1 || workingHours > 24
      || !Number.isInteger(annualLeaveDays) || annualLeaveDays < 0 || annualLeaveDays > 365) {
      return NextResponse.json({ error: 'أيام أو ساعات العمل أو رصيد الإجازة غير صالح' }, { status: 400 });
    }

    // Verify employee belongs to this agency
    const [emp] = await db.select({ id: employees.id, isActive: employees.isActive })
      .from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)));
    if (!emp) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    if (!emp.isActive) return NextResponse.json({ error: 'لا يمكن إنشاء عقد جديد لموظف غير نشط' }, { status: 422 });

    const id             = crypto.randomUUID();
    const contractNumber = body.contractNumber ?? `CT-${Date.now()}`;
    if (!contractNumber.trim() || contractNumber.length > 64) {
      return NextResponse.json({ error: 'رقم العقد غير صالح' }, { status: 400 });
    }
    const VALID_TYPES = new Set(['full_time', 'part_time', 'contract', 'intern']);
    const type = body.type ?? 'full_time';
    if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'نوع العقد غير صالح' }, { status: 400 });

    const [duplicateNumber] = await db.select({ id: employeeContracts.id })
      .from(employeeContracts)
      .where(and(eq(employeeContracts.agencyId, agencyId), eq(employeeContracts.contractNumber, contractNumber.trim())))
      .limit(1);
    if (duplicateNumber) return NextResponse.json({ error: 'رقم العقد مستخدم مسبقاً' }, { status: 409 });

    const [overlap] = await db.select({ id: employeeContracts.id })
      .from(employeeContracts)
      .where(and(
        eq(employeeContracts.agencyId, agencyId),
        eq(employeeContracts.employeeId, body.employeeId),
        eq(employeeContracts.status, 'active'),
        lte(employeeContracts.startDate, body.endDate ?? '9999-12-31'),
        or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, body.startDate)),
      ))
      .limit(1);
    if (overlap) return NextResponse.json({ error: 'توجد فترة عقد نشط متداخلة لهذا الموظف' }, { status: 409 });

    await db.transaction(async (tx) => {
      await tx.insert(employeeContracts).values({
        id,
        agencyId,
        employeeId:                body.employeeId,
        contractNumber: contractNumber.trim(),
        type,
        startDate:                 body.startDate,
        endDate:                   body.endDate                   ?? null,
        baseSalaryHalalas:         body.baseSalaryHalalas,
        housingAllowanceHalalas:   body.housingAllowanceHalalas   ?? 0,
        transportAllowanceHalalas: body.transportAllowanceHalalas ?? 0,
        otherAllowancesHalalas:    body.otherAllowancesHalalas    ?? 0,
        salaryComponents:          (body.salaryComponents         ?? null) as never,
        workingDaysPerWeek:        workingDays,
        workingHoursPerDay:        workingHours,
        annualLeaveDays,
        notes:                     body.notes                     ?? null,
        createdBy:                 uid,
      });
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'employee_contract', resourceId: id, after: { employeeId: body.employeeId, contractNumber } });
    return NextResponse.json({ success: true, id, contractNumber });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
