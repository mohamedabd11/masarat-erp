import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { costCenters } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; type: string;
      parentId: string; isActive: boolean; notes: string;
    }>;
    const [existing] = await db.select().from(costCenters)
      .where(and(eq(costCenters.id, params.id), eq(costCenters.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'مركز التكلفة غير موجود' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['nameAr','nameEn','type','parentId','isActive','notes'] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    await db.update(costCenters).set(patch as Partial<typeof costCenters.$inferInsert>)
      .where(and(eq(costCenters.id, params.id), eq(costCenters.agencyId, agencyId)));
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
    const [existing] = await db.select().from(costCenters)
      .where(and(eq(costCenters.id, params.id), eq(costCenters.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'مركز التكلفة غير موجود' }, { status: 404 });
    await db.delete(costCenters).where(and(eq(costCenters.id, params.id), eq(costCenters.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
