import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { departments, employees, salaryPayments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isIsoDate, isNonNegativeInteger } from '@/lib/hr-validation';

const EDITABLE_FIELDS = new Set([
  'nameAr', 'nameEn', 'department', 'departmentId', 'position', 'hireDate', 'endDate',
  'salaryHalalas', 'phone', 'email', 'nationalId', 'iqamaNumber',
  'bankAccountNumber', 'bankName', 'nationalityType', 'isActive',
  'gosiScheme', 'gosiEnrollmentDate', 'sanedApplicable',
]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'employees', db);
    const body = await request.json() as Record<string, unknown>;
    const unknown = Object.keys(body).filter((key) => !EDITABLE_FIELDS.has(key));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `حقول غير مدعومة: ${unknown.join(', ')}` }, { status: 400 });
    }
    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'لا توجد تعديلات للحفظ' }, { status: 400 });
    }
    if ('nationalityType' in body && !['saudi', 'expat'].includes(body.nationalityType as string)) {
      return NextResponse.json({ error: 'nationality_type يجب أن يكون saudi أو expat' }, { status: 400 });
    }
    if ('nameAr' in body && (typeof body.nameAr !== 'string' || !body.nameAr.trim())) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    }
    if ('salaryHalalas' in body && !isNonNegativeInteger(body.salaryHalalas)) {
      return NextResponse.json({ error: 'الراتب يجب أن يكون مبلغاً صحيحاً غير سالب' }, { status: 400 });
    }
    for (const field of ['hireDate', 'endDate'] as const) {
      const value = body[field];
      if (value !== undefined && value !== null && value !== '' && !isIsoDate(value)) {
        return NextResponse.json({ error: `${field === 'hireDate' ? 'تاريخ التعيين' : 'تاريخ نهاية الخدمة'} غير صالح` }, { status: 400 });
      }
    }
    if (body.gosiEnrollmentDate !== undefined && body.gosiEnrollmentDate !== null && body.gosiEnrollmentDate !== '' && !isIsoDate(body.gosiEnrollmentDate)) {
      return NextResponse.json({ error: 'تاريخ بدء التأمينات غير صالح' }, { status: 400 });
    }
    if ('sanedApplicable' in body && typeof body.sanedApplicable !== 'boolean') {
      return NextResponse.json({ error: 'حالة شمول ساند غير صالحة' }, { status: 400 });
    }
    if ('isActive' in body && typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'حالة الموظف غير صالحة' }, { status: 400 });
    }
    if (typeof body.email === 'string' && body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    }

    const [existing] = await db.select({
      hireDate: employees.hireDate,
      endDate: employees.endDate,
      nationalityType: employees.nationalityType,
      gosiScheme: employees.gosiScheme,
      gosiEnrollmentDate: employees.gosiEnrollmentDate,
    })
      .from(employees)
      .where(and(eq(employees.id, params.id), eq(employees.agencyId, agencyId)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    if (typeof body.departmentId === 'string' && body.departmentId) {
      const [department] = await db.select({ code: departments.code }).from(departments)
        .where(and(eq(departments.id, body.departmentId), eq(departments.agencyId, agencyId), eq(departments.isActive, true)))
        .limit(1);
      if (!department) return NextResponse.json({ error: 'القسم غير موجود أو غير نشط' }, { status: 422 });
      body.department = department.code;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') patch[key] = value.trim() || null;
      else patch[key] = value;
    }
    if (typeof body.nameAr === 'string') patch['nameAr'] = body.nameAr.trim();
    if (body.isActive === true) patch['endDate'] = null;
    if (body.endDate) patch['isActive'] = false;

    const finalNationality = (patch['nationalityType'] as string | undefined) ?? existing.nationalityType;
    const finalScheme = finalNationality === 'expat'
      ? 'expat'
      : ((patch['gosiScheme'] as string | undefined) ?? existing.gosiScheme);
    if (finalNationality === 'saudi' && !['legacy', 'new', 'exempt'].includes(finalScheme)) {
      return NextResponse.json({ error: 'نظام التأمينات للموظف السعودي غير صالح' }, { status: 400 });
    }
    patch['gosiScheme'] = finalScheme;
    const finalInsuranceStart = (patch['gosiEnrollmentDate'] as string | null | undefined)
      ?? existing.gosiEnrollmentDate
      ?? (patch['hireDate'] as string | null | undefined)
      ?? existing.hireDate;
    if (finalScheme === 'new' && finalInsuranceStart && finalInsuranceStart < '2024-07-03') {
      return NextResponse.json({ error: 'النظام الجديد يطبق على من يبدأ اشتراكه دون مدد سابقة من 3 يوليو 2024' }, { status: 422 });
    }
    if (finalNationality === 'expat' || finalScheme === 'exempt') patch['sanedApplicable'] = false;

    const finalHireDate = (patch['hireDate'] as string | null | undefined) ?? existing.hireDate;
    const finalEndDate = (patch['endDate'] as string | null | undefined) ?? existing.endDate;
    if (finalHireDate && finalEndDate && finalEndDate < finalHireDate) {
      return NextResponse.json({ error: 'تاريخ نهاية الخدمة لا يمكن أن يسبق تاريخ التعيين' }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx.update(employees).set(patch as Partial<typeof employees.$inferInsert>)
        .where(and(eq(employees.id, params.id), eq(employees.agencyId, agencyId)));
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'توجد بيانات مكررة لموظف آخر' }, { status: 409 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'employees', db);

    const deleted = await db.transaction(async (tx) => {
      const [hasSalary] = await tx
        .select({ id: salaryPayments.id })
        .from(salaryPayments)
        .where(and(eq(salaryPayments.employeeId, params.id), eq(salaryPayments.agencyId, agencyId)))
        .limit(1);
      if (hasSalary) {
        throw new BusinessError('لا يمكن حذف الموظف لوجود مدفوعات راتب مرتبطة به. قم بتعطيله بدلاً من الحذف.', 422);
      }

      return tx.delete(employees)
        .where(and(eq(employees.id, params.id), eq(employees.agencyId, agencyId)))
        .returning({ id: employees.id });
    });
    if (deleted.length === 0) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23503') {
      return NextResponse.json(
        { error: 'لا يمكن حذف الموظف لوجود سجلات مرتبطة به. قم بإنهاء خدمته أو تعطيله بدلاً من الحذف.' },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
