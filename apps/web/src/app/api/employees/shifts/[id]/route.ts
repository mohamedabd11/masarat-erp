import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; startTime: string; endTime: string;
      daysOfWeek: number[]; isDefault: boolean; isActive: boolean;
    }>;

    const [existing] = await db.select().from(shifts)
      .where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الوردية غير موجودة' }, { status: 404 });

    if (body.startTime && !/^\d{2}:\d{2}$/.test(body.startTime)) {
      return NextResponse.json({ error: 'صيغة وقت البداية غير صالحة' }, { status: 400 });
    }
    if (body.endTime && !/^\d{2}:\d{2}$/.test(body.endTime)) {
      return NextResponse.json({ error: 'صيغة وقت النهاية غير صالحة' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['nameAr','nameEn','startTime','endTime','daysOfWeek','isDefault','isActive'] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    await db.update(shifts).set(patch as Partial<typeof shifts.$inferInsert>)
      .where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));

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

    const [existing] = await db.select().from(shifts)
      .where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الوردية غير موجودة' }, { status: 404 });

    await db.delete(shifts).where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
