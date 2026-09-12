import { NextResponse } from 'next/server';
import { and, eq, gte, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employeeContracts } from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_ADMIN_ONLY, assertRole, verifyAuth } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isIsoDate, isNonNegativeInteger } from '@/lib/hr-validation';
import { logAudit } from '@/lib/audit';

const EDITABLE = new Set([
  'contractNumber', 'type', 'startDate', 'endDate', 'baseSalaryHalalas',
  'housingAllowanceHalalas', 'transportAllowanceHalalas', 'otherAllowancesHalalas',
  'workingDaysPerWeek', 'workingHoursPerDay', 'annualLeaveDays', 'status', 'notes',
]);
const TYPES = new Set(['full_time', 'part_time', 'contract', 'intern']);
const STATUSES = new Set(['active', 'expired', 'terminated']);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'contracts', db);
    const body = await request.json() as Record<string, unknown>;
    const unknown = Object.keys(body).filter(key => !EDITABLE.has(key));
    if (unknown.length || Object.keys(body).length === 0) return NextResponse.json({ error: unknown.length ? `حقول غير مدعومة: ${unknown.join(', ')}` : 'لا توجد تعديلات' }, { status: 400 });

    const [existing] = await db.select().from(employeeContracts).where(and(
      eq(employeeContracts.id, params.id), eq(employeeContracts.agencyId, agencyId),
    )).limit(1);
    if (!existing) return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 });

    const startDate = typeof body.startDate === 'string' ? body.startDate : existing.startDate;
    const endDate = body.endDate === null || body.endDate === '' ? null : (typeof body.endDate === 'string' ? body.endDate : existing.endDate);
    if (!isIsoDate(startDate) || (endDate && !isIsoDate(endDate)) || (endDate && endDate < startDate)) {
      return NextResponse.json({ error: 'فترة العقد غير صالحة' }, { status: 400 });
    }
    if (body.type !== undefined && (typeof body.type !== 'string' || !TYPES.has(body.type))) return NextResponse.json({ error: 'نوع العقد غير صالح' }, { status: 400 });
    if (body.status !== undefined && (typeof body.status !== 'string' || !STATUSES.has(body.status))) return NextResponse.json({ error: 'حالة العقد غير صالحة' }, { status: 400 });
    if (body.contractNumber !== undefined && (typeof body.contractNumber !== 'string' || !body.contractNumber.trim() || body.contractNumber.length > 64)) {
      return NextResponse.json({ error: 'رقم العقد غير صالح' }, { status: 400 });
    }
    if (body.baseSalaryHalalas !== undefined && (!isNonNegativeInteger(body.baseSalaryHalalas) || body.baseSalaryHalalas <= 0)) {
      return NextResponse.json({ error: 'الراتب الأساسي يجب أن يكون رقماً صحيحاً موجباً' }, { status: 400 });
    }
    for (const field of ['housingAllowanceHalalas', 'transportAllowanceHalalas', 'otherAllowancesHalalas'] as const) {
      if (body[field] !== undefined && !isNonNegativeInteger(body[field])) return NextResponse.json({ error: `${field} غير صالح` }, { status: 400 });
    }
    if (body.annualLeaveDays !== undefined && (!isNonNegativeInteger(body.annualLeaveDays) || body.annualLeaveDays > 365)) {
      return NextResponse.json({ error: 'رصيد الإجازة السنوي يجب أن يكون بين 0 و365 يوماً' }, { status: 400 });
    }
    if (body.workingDaysPerWeek !== undefined && (!Number.isInteger(body.workingDaysPerWeek) || Number(body.workingDaysPerWeek) < 1 || Number(body.workingDaysPerWeek) > 7)) return NextResponse.json({ error: 'أيام العمل يجب أن تكون بين 1 و7' }, { status: 400 });
    if (body.workingHoursPerDay !== undefined && (!Number.isInteger(body.workingHoursPerDay) || Number(body.workingHoursPerDay) < 1 || Number(body.workingHoursPerDay) > 24)) return NextResponse.json({ error: 'ساعات العمل يجب أن تكون بين 1 و24' }, { status: 400 });

    const finalStatus = typeof body.status === 'string' ? body.status : existing.status;
    if (finalStatus === 'active') {
      const [overlap] = await db.select({ id: employeeContracts.id }).from(employeeContracts).where(and(
        eq(employeeContracts.agencyId, agencyId), eq(employeeContracts.employeeId, existing.employeeId),
        eq(employeeContracts.status, 'active'), ne(employeeContracts.id, existing.id),
        lte(employeeContracts.startDate, endDate ?? '9999-12-31'),
        or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, startDate)),
      )).limit(1);
      if (overlap) return NextResponse.json({ error: 'توجد فترة عقد نشط متداخلة لهذا الموظف' }, { status: 409 });
    }

    const patch: Partial<typeof employeeContracts.$inferInsert> = { updatedAt: new Date(), startDate, endDate };
    for (const [key, value] of Object.entries(body)) {
      if (key === 'endDate' || key === 'startDate') continue;
      (patch as Record<string, unknown>)[key] = typeof value === 'string' ? value.trim() || null : value;
    }
    await db.update(employeeContracts).set(patch).where(and(eq(employeeContracts.id, existing.id), eq(employeeContracts.agencyId, agencyId)));
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'employee_contract', resourceId: existing.id, before: existing, after: patch });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') return NextResponse.json({ error: 'رقم العقد مستخدم مسبقاً' }, { status: 409 });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
