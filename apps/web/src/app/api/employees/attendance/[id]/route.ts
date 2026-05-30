import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_STAFF_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_STAFF_UP]);

    const body = await request.json() as Partial<{
      checkIn: string; checkOut: string; status: string;
      workMinutes: number; overtimeMinutes: number; notes: string; shiftId: string;
    }>;

    const [existing] = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.id, params.id), eq(attendanceRecords.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'سجل الحضور غير موجود' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.checkIn  !== undefined) patch['checkIn']  = new Date(body.checkIn);
    if (body.checkOut !== undefined) patch['checkOut'] = new Date(body.checkOut);
    if (body.status   !== undefined) patch['status']   = body.status;
    if (body.notes    !== undefined) patch['notes']    = body.notes;
    if (body.shiftId  !== undefined) patch['shiftId']  = body.shiftId;

    // Recalculate workMinutes if both check-in/out now known
    const checkIn  = body.checkIn  ? new Date(body.checkIn)  : existing.checkIn;
    const checkOut = body.checkOut ? new Date(body.checkOut) : existing.checkOut;
    if (checkIn && checkOut && body.workMinutes === undefined) {
      patch['workMinutes'] = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000));
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
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
