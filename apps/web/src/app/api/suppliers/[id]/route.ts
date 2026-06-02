import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers, supplierPayments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string | null; type: string | null;
      phone: string | null; email: string | null; vatNumber: string | null;
      notes: string | null; isActive: boolean;
    }>;
    const now = new Date();
    await db.update(suppliers).set({ ...body, updatedAt: now })
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
