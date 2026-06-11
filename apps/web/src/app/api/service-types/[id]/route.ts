import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serviceTypes, bookings } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [row] = await db.select().from(serviceTypes)
      .where(and(eq(serviceTypes.id, params.id), eq(serviceTypes.agencyId, agencyId)));
    if (!row) return NextResponse.json({ error: 'نوع الخدمة غير موجود' }, { status: 404 });
    return NextResponse.json({ serviceType: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as Record<string, unknown>;
    // Allowlist editable columns only — never spread the raw body, which would
    // let a caller rewrite agencyId/id and move the row to another tenant.
    const ALLOWED = ['nameAr', 'nameEn', 'icon', 'revenueMode', 'vatRate', 'isTaxable', 'isActive'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) patch[k] = body[k];
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'لا توجد حقول قابلة للتعديل' }, { status: 400 });
    }
    await db.update(serviceTypes).set(patch as Partial<typeof serviceTypes.$inferInsert>)
      .where(and(eq(serviceTypes.id, params.id), eq(serviceTypes.agencyId, agencyId)));
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

    // Prevent deletion if any booking references this custom service type
    const [usedByBooking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customTypeId, params.id), eq(bookings.agencyId, agencyId)))
      .limit(1);
    if (usedByBooking) {
      return NextResponse.json(
        { error: 'لا يمكن حذف نوع الخدمة لأنه مستخدم في حجز واحد أو أكثر' },
        { status: 422 },
      );
    }

    await db.delete(serviceTypes).where(and(eq(serviceTypes.id, params.id), eq(serviceTypes.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
