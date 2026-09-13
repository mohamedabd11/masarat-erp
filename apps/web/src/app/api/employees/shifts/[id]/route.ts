import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts, attendanceRecords } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isTime24h, validDaysOfWeek } from '@/lib/hr-validation';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'attendance', db);

    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; startTime: string; endTime: string;
      daysOfWeek: number[]; isDefault: boolean; isActive: boolean;
    }>;

    const [existing] = await db.select().from(shifts)
      .where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الوردية غير موجودة' }, { status: 404 });

    if (body.startTime && !isTime24h(body.startTime)) {
      return NextResponse.json({ error: 'صيغة وقت البداية غير صالحة' }, { status: 400 });
    }
    if (body.endTime && !isTime24h(body.endTime)) {
      return NextResponse.json({ error: 'صيغة وقت النهاية غير صالحة' }, { status: 400 });
    }
    if (body.nameAr !== undefined && !body.nameAr.trim()) return NextResponse.json({ error: 'اسم الوردية مطلوب' }, { status: 400 });
    if (body.daysOfWeek !== undefined && !validDaysOfWeek(body.daysOfWeek)) return NextResponse.json({ error: 'أيام الوردية غير صالحة' }, { status: 400 });
    const finalStart = body.startTime ?? existing.startTime;
    const finalEnd = body.endTime ?? existing.endTime;
    if (finalStart === finalEnd) return NextResponse.json({ error: 'وقت البداية والنهاية لا يمكن أن يكونا متطابقين' }, { status: 400 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['nameAr','nameEn','startTime','endTime','daysOfWeek','isDefault','isActive'] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    await db.transaction(async (tx) => {
      if (body.isDefault) {
        await tx.update(shifts).set({ isDefault: false, updatedAt: new Date() }).where(eq(shifts.agencyId, agencyId));
      }
      await tx.update(shifts).set(patch as Partial<typeof shifts.$inferInsert>)
        .where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'attendance', db);

    const [existing] = await db.select().from(shifts)
      .where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الوردية غير موجودة' }, { status: 404 });

    const [used] = await db.select({ id: attendanceRecords.id }).from(attendanceRecords)
      .where(and(eq(attendanceRecords.agencyId, agencyId), eq(attendanceRecords.shiftId, params.id)))
      .limit(1);
    if (used) return NextResponse.json({ error: 'لا يمكن حذف وردية مرتبطة بسجلات حضور؛ قم بتعطيلها بدلاً من الحذف' }, { status: 422 });

    await db.transaction(async (tx) => {
      await tx.delete(shifts).where(and(eq(shifts.id, params.id), eq(shifts.agencyId, agencyId)));
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
