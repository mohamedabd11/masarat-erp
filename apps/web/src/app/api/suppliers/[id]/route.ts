import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers, supplierPayments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as Record<string, unknown>;
    const now = new Date();
    // Allowlist editable fields — never spread the raw body. balanceHalalas
    // (financial, AP-driving) and agencyId/id must not be client-writable.
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const k of ['nameAr', 'nameEn', 'type', 'phone', 'email', 'vatNumber', 'notes', 'isActive'] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    await db.update(suppliers).set(patch as Partial<typeof suppliers.$inferInsert>)
      .where(and(eq(suppliers.id, params.id), eq(suppliers.agencyId, agencyId)));
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

    // Prevent deletion if payments reference this supplier
    const [usedByPayment] = await db
      .select({ id: supplierPayments.id })
      .from(supplierPayments)
      .where(and(eq(supplierPayments.supplierId, params.id), eq(supplierPayments.agencyId, agencyId)))
      .limit(1);
    if (usedByPayment) {
      return NextResponse.json(
        { error: 'لا يمكن حذف المورد لوجود مدفوعات مرتبطة به. قم بتعطيله بدلاً من الحذف.' },
        { status: 422 },
      );
    }

    await db.delete(suppliers).where(and(eq(suppliers.id, params.id), eq(suppliers.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
