import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { attendanceRecords, employees, shifts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_STAFF_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { isIsoDate, isYearMonth, isNonNegativeInteger, parseValidTimestamp } from '@/lib/hr-validation';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'attendance', db);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const month      = url.searchParams.get('month')      ?? undefined; // YYYY-MM
    const date       = url.searchParams.get('date')       ?? undefined; // YYYY-MM-DD
    if (month && !isYearMonth(month)) return NextResponse.json({ error: 'الشهر غير صالح' }, { status: 400 });
    if (date && !isIsoDate(date)) return NextResponse.json({ error: 'التاريخ غير صالح' }, { status: 400 });

    const conditions = [eq(attendanceRecords.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(attendanceRecords.employeeId, employeeId));
    if (date)       conditions.push(eq(attendanceRecords.date, date));
    if (month)      conditions.push(sql`${attendanceRecords.date} LIKE ${month + '-%'}`);

    const rows = await db.select().from(attendanceRecords)
      .where(and(...conditions))
      .orderBy(attendanceRecords.date, attendanceRecords.employeeId);

    return NextResponse.json({ attendance: rows });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'half_day', 'on_leave']);

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_STAFF_UP]);
    await requireFeature(agencyId, 'attendance', db);

    const body = await request.json() as {
      employeeId:       string;
      date:             string;     // YYYY-MM-DD
      status?:          string;
      checkIn?:         string;     // ISO timestamp or HH:MM
      checkOut?:        string;
      shiftId?:         string;
      workMinutes?:     number;
      overtimeMinutes?: number;
      notes?:           string;
    };

    if (!body.employeeId || !body.date) {
      return NextResponse.json({ error: 'employeeId و date مطلوبان' }, { status: 400 });
    }
    if (!isIsoDate(body.date)) {
      return NextResponse.json({ error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' }, { status: 400 });
    }
    const status = body.status ?? 'present';
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'حالة الحضور غير صالحة' }, { status: 400 });
    }

    // Verify employee belongs to same agency
    const [emp] = await db.select({ id: employees.id, isActive: employees.isActive }).from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)));
    if (!emp) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    if (!emp.isActive) return NextResponse.json({ error: 'لا يمكن تسجيل حضور لموظف غير نشط' }, { status: 422 });

    if (body.shiftId) {
      const [shift] = await db.select({ id: shifts.id }).from(shifts)
        .where(and(eq(shifts.id, body.shiftId), eq(shifts.agencyId, agencyId), eq(shifts.isActive, true)))
        .limit(1);
      if (!shift) return NextResponse.json({ error: 'الوردية غير موجودة أو غير نشطة' }, { status: 404 });
    }

    for (const [label, value] of [['دقائق العمل', body.workMinutes], ['دقائق العمل الإضافي', body.overtimeMinutes]] as const) {
      if (value !== undefined && (!isNonNegativeInteger(value) || value > 1_440)) {
        return NextResponse.json({ error: `${label} غير صالحة` }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    const checkInTs  = body.checkIn  ? parseValidTimestamp(body.checkIn)  : null;
    const checkOutTs = body.checkOut ? parseValidTimestamp(body.checkOut) : null;
    if ((body.checkIn && !checkInTs) || (body.checkOut && !checkOutTs)) {
      return NextResponse.json({ error: 'وقت الحضور أو الانصراف غير صالح' }, { status: 400 });
    }
    if ((status === 'absent' || status === 'on_leave') && (checkInTs || checkOutTs)) {
      return NextResponse.json({ error: 'لا تُسجل أوقات حضور لحالة غياب أو إجازة' }, { status: 400 });
    }
    if (checkInTs && checkOutTs && checkOutTs <= checkInTs) {
      return NextResponse.json({ error: 'وقت الانصراف يجب أن يكون بعد وقت الحضور' }, { status: 400 });
    }

    // Auto-calculate workMinutes if both times given
    let workMinutes = body.workMinutes ?? 0;
    if (checkInTs && checkOutTs && body.workMinutes === undefined) {
      workMinutes = Math.max(0, Math.floor((checkOutTs.getTime() - checkInTs.getTime()) / 60000));
      if (workMinutes > 1_440) return NextResponse.json({ error: 'مدة العمل لا يمكن أن تتجاوز 24 ساعة' }, { status: 400 });
    }

    await db.insert(attendanceRecords).values({
      id,
      agencyId,
      employeeId:      body.employeeId,
      shiftId:         body.shiftId    ?? null,
      date:            body.date,
      checkIn:         checkInTs,
      checkOut:        checkOutTs,
      status,
      workMinutes,
      overtimeMinutes: body.overtimeMinutes ?? 0,
      notes:           body.notes    ?? null,
      createdBy:       uid,
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'attendance', resourceId: id, after: { employeeId: body.employeeId, date: body.date, status } });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = (err as Error).message ?? '';
    if (msg.includes('attendance_employee_date_uq')) {
      return NextResponse.json({ error: 'سجل الحضور لهذا اليوم موجود مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
