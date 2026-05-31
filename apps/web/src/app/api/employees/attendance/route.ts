import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { attendanceRecords, employees } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_STAFF_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'attendance', db);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const month      = url.searchParams.get('month')      ?? undefined; // YYYY-MM
    const date       = url.searchParams.get('date')       ?? undefined; // YYYY-MM-DD

    const conditions = [eq(attendanceRecords.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(attendanceRecords.employeeId, employeeId));
    if (date)       conditions.push(eq(attendanceRecords.date, date));
    if (month)      conditions.push(sql`${attendanceRecords.date} LIKE ${month + '-%'}`);

    const rows = await db.select().from(attendanceRecords)
      .where(and(...conditions))
      .orderBy(attendanceRecords.date, attendanceRecords.employeeId);

    return NextResponse.json({ attendance: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'half_day', 'on_leave']);

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_STAFF_UP]);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' }, { status: 400 });
    }
    const status = body.status ?? 'present';
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'حالة الحضور غير صالحة' }, { status: 400 });
    }

    // Verify employee belongs to same agency
    const [emp] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)));
    if (!emp) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    const id = crypto.randomUUID();
    const checkInTs  = body.checkIn  ? new Date(body.checkIn)  : null;
    const checkOutTs = body.checkOut ? new Date(body.checkOut) : null;

    // Auto-calculate workMinutes if both times given
    let workMinutes = body.workMinutes ?? 0;
    if (checkInTs && checkOutTs && !body.workMinutes) {
      workMinutes = Math.max(0, Math.floor((checkOutTs.getTime() - checkInTs.getTime()) / 60000));
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
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = (err as Error).message ?? '';
    if (msg.includes('attendance_employee_date_uq')) {
      return NextResponse.json({ error: 'سجل الحضور لهذا اليوم موجود مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
