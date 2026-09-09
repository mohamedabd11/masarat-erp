import { NextResponse } from 'next/server';
import { eq, and, desc, count, lte, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveRequests, employees } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { inclusiveCalendarDays, isIsoDate } from '@/lib/hr-validation';
import { logAudit } from '@/lib/audit';

const VALID_TYPES   = new Set(['annual', 'sick', 'unpaid']);
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected']);
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'leave_management', db);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const status     = url.searchParams.get('status')     ?? undefined;
    const page     = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset   = (page - 1) * pageSize;

    const conditions = [eq(leaveRequests.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId));
    if (status)     conditions.push(eq(leaveRequests.status, status));

    const [{ total }] = await db.select({ total: count(leaveRequests.id) })
      .from(leaveRequests).where(and(...conditions));

    const rows = await db
      .select()
      .from(leaveRequests)
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(pageSize)
      .offset(offset);
    return NextResponse.json({
      leaveRequests: rows,
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);
    await requireFeature(agencyId, 'leave_management', db);
    const body = await request.json() as {
      employeeId: string;
      type:       string;
      startDate:  string;
      endDate:    string;
      days?:      number;
      notes?:     string;
    };

    const { employeeId, type, startDate, endDate } = body;
    if (!employeeId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: 'employeeId وtype وstartDate وendDate مطلوبة' }, { status: 400 });
    }
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json({ error: 'نوع الإجازة غير صالح. القيم المقبولة: annual, sick, unpaid' }, { status: 400 });
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' }, { status: 400 });
    }
    if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
      return NextResponse.json({ error: 'الإجازة الممتدة بين سنتين يجب تقسيمها إلى طلب لكل سنة لضمان دقة الرصيد' }, { status: 422 });
    }

    const days = inclusiveCalendarDays(startDate, endDate);
    if (body.days !== undefined && body.days !== days) {
      return NextResponse.json({ error: `عدد الأيام الصحيح للفترة هو ${days}` }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      // Serialize requests for the same employee so two simultaneous submissions
      // cannot both pass the overlap check.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${agencyId}:${employeeId}`}, 0))`);

      const [employee] = await tx
        .select({ id: employees.id, isActive: employees.isActive })
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.agencyId, agencyId)))
        .limit(1);
      if (!employee) throw new BusinessError('الموظف غير موجود', 404);
      if (!employee.isActive) throw new BusinessError('لا يمكن تقديم إجازة لموظف غير نشط', 422);

      const [overlap] = await tx.select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.agencyId, agencyId),
          eq(leaveRequests.employeeId, employeeId),
          ne(leaveRequests.status, 'rejected'),
          lte(leaveRequests.startDate, endDate),
          gte(leaveRequests.endDate, startDate),
        ))
        .limit(1);
      if (overlap) throw new BusinessError('توجد إجازة أخرى متداخلة مع هذه الفترة', 409);

      await tx.insert(leaveRequests).values({
        id, agencyId, employeeId, type,
        startDate, endDate, days,
        status: 'pending',
        notes: body.notes?.trim() || null,
      });
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'leave_request', resourceId: id, after: { employeeId, type, startDate, endDate, days } });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'leave_request_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
