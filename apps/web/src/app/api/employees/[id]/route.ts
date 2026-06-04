import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employees, salaryPayments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as Record<string, unknown>;
    const now = new Date();
    // Strip immutable identity/system columns — never let the client move the
    // record to another tenant (agencyId), change its id/employeeNumber, or
    // rewrite the GL link / timestamps.
    const STRIP = new Set(['id', 'agencyId', 'employeeNumber', 'glAccountId', 'createdAt', 'updatedAt']);
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, v] of Object.entries(body)) if (!STRIP.has(k)) patch[k] = v;
    await db.update(employees).set(patch as Partial<typeof employees.$inferInsert>)
      .where(and(eq(employees.id, params.id), eq(employees.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const [hasSalary] = await db
      .select({ id: salaryPayments.id })
      .from(salaryPayments)
      .where(and(eq(salaryPayments.employeeId, params.id), eq(salaryPayments.agencyId, agencyId)))
      .limit(1);
    if (hasSalary) {
      return NextResponse.json(
        { error: 'لا يمكن حذف الموظف لوجود مدفوعات راتب مرتبطة به. قم بتعطيله بدلاً من الحذف.' },
        { status: 422 },
      );
    }

    await db.delete(employees).where(and(eq(employees.id, params.id), eq(employees.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
