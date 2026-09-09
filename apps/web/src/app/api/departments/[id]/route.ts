import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { departments, employees } from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_MANAGER_UP, assertRole, verifyAuth } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'employees', db);
    const body = await request.json() as { nameAr?: string; nameEn?: string; isActive?: boolean };
    const patch: Partial<typeof departments.$inferInsert> = { updatedAt: new Date() };
    if (body.nameAr !== undefined) {
      const nameAr = body.nameAr.trim();
      if (!nameAr || nameAr.length > 120) return NextResponse.json({ error: 'اسم القسم مطلوب وبحد أقصى 120 حرفاً' }, { status: 400 });
      patch.nameAr = nameAr;
    }
    if (body.nameEn !== undefined) patch.nameEn = body.nameEn.trim() || null;
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') return NextResponse.json({ error: 'حالة القسم غير صالحة' }, { status: 400 });
      patch.isActive = body.isActive;
    }
    if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'لا توجد تعديلات للحفظ' }, { status: 400 });
    const rows = await db.update(departments).set(patch)
      .where(and(eq(departments.id, params.id), eq(departments.agencyId, agencyId)))
      .returning({ id: departments.id });
    if (rows.length === 0) return NextResponse.json({ error: 'القسم غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') return NextResponse.json({ error: 'اسم القسم مستخدم مسبقاً' }, { status: 409 });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'employees', db);
    const [used] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.agencyId, agencyId), eq(employees.departmentId, params.id))).limit(1);
    if (used) return NextResponse.json({ error: 'لا يمكن حذف قسم مرتبط بموظفين؛ يمكنك تعطيله بدلاً من ذلك' }, { status: 422 });
    const rows = await db.delete(departments)
      .where(and(eq(departments.id, params.id), eq(departments.agencyId, agencyId)))
      .returning({ id: departments.id });
    if (rows.length === 0) return NextResponse.json({ error: 'القسم غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
