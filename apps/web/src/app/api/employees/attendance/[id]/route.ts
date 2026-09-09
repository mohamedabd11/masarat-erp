import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { attendanceRecords, shifts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_STAFF_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { requireFeature } from '@/lib/feature-access';
import { isNonNegativeInteger, parseValidTimestamp } from '@/lib/hr-validation';

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'half_day', 'on_leave']);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_STAFF_UP]);
    await requireFeature(agencyId, 'attendance', db);

    const body = await request.json() as Partial<{
      checkIn: string; checkOut: string; status: string;
      workMinutes: number; overtimeMinutes: number; notes: string; shiftId: string;
    }>;

    const [existing] = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.id, params.id), eq(attendanceRecords.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'سجل الحضور غير موجود' }, { status: 404 });

    if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'حالة الحضور غير صالحة' }, { status: 400 });
    }
    for (const [label, value] of [['دقائق العمل', body.workMinutes], ['دقائق العمل الإضافي', body.overtimeMinutes]] as const) {
      if (value !== undefined && (!isNonNegativeInteger(value) || value > 1_440)) {
        return NextResponse.json({ error: `${label} غير صالحة` }, { status: 400 });
      }
    }
    if (body.shiftId) {
      const [shift] = await db.select({ id: shifts.id }).from(shifts)
        .where(and(eq(shifts.id, body.shiftId), eq(shifts.agencyId, agencyId), eq(shifts.isActive, true)))
        .limit(1);
      if (!shift) return NextResponse.json({ error: 'الوردية غير موجودة أو غير نشطة' }, { status: 404 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const parsedCheckIn = body.checkIn !== undefined ? parseValidTimestamp(body.checkIn) : existing.checkIn;
    const parsedCheckOut = body.checkOut !== undefined ? parseValidTimestamp(body.checkOut) : existing.checkOut;
    if ((body.checkIn !== undefined && !parsedCheckIn) || (body.checkOut !== undefined && !parsedCheckOut)) {
      return NextResponse.json({ error: 'وقت الحضور أو الانصراف غير صالح' }, { status: 400 });
    }
    if (parsedCheckIn && parsedCheckOut && parsedCheckOut <= parsedCheckIn) {
      return NextResponse.json({ error: 'وقت الانصراف يجب أن يكون بعد وقت الحضور' }, { status: 400 });
    }
    const finalStatus = body.status ?? existing.status;
    if ((finalStatus === 'absent' || finalStatus === 'on_leave') && (parsedCheckIn || parsedCheckOut)) {
      return NextResponse.json({ error: 'لا تُسجل أوقات حضور لحالة غياب أو إجازة' }, { status: 400 });
    }
    if (body.checkIn  !== undefined) patch['checkIn']  = parsedCheckIn;
    if (body.checkOut !== undefined) patch['checkOut'] = parsedCheckOut;
    if (body.status   !== undefined) patch['status']   = body.status;
    if (body.notes    !== undefined) patch['notes']    = body.notes;
    if (body.shiftId  !== undefined) patch['shiftId']  = body.shiftId;

    // Recalculate workMinutes if both check-in/out now known
    const checkIn  = parsedCheckIn;
    const checkOut = parsedCheckOut;
    if (checkIn && checkOut && body.workMinutes === undefined) {
      const workMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
      if (workMinutes > 1_440) return NextResponse.json({ error: 'مدة العمل لا يمكن أن تتجاوز 24 ساعة' }, { status: 400 });
      patch['workMinutes'] = workMinutes;
    } else if (body.workMinutes !== undefined) {
      patch['workMinutes'] = body.workMinutes;
    }
    if (body.overtimeMinutes !== undefined) patch['overtimeMinutes'] = body.overtimeMinutes;

    await db.update(attendanceRecords)
      .set(patch as Partial<typeof attendanceRecords.$inferInsert>)
      .where(and(eq(attendanceRecords.id, params.id), eq(attendanceRecords.agencyId, agencyId)));

    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'attendance', resourceId: params.id, before: existing, after: patch });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
