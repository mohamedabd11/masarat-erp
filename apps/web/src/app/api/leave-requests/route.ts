import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveRequests, employees } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const VALID_TYPES   = new Set(['annual', 'sick', 'unpaid']);
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected']);

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const status     = url.searchParams.get('status')     ?? undefined;

    const conditions = [eq(leaveRequests.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId));
    if (status)     conditions.push(eq(leaveRequests.status, status));

    const rows = await db
      .select()
      .from(leaveRequests)
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.createdAt));
    return NextResponse.json({ leaveRequests: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
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
    if (endDate < startDate) {
      return NextResponse.json({ error: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية' }, { status: 400 });
    }

    // Verify employee belongs to this agency
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.agencyId, agencyId)));
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    const start = new Date(startDate);
    const end   = new Date(endDate);
    const days  = body.days ?? Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1;

    const id = crypto.randomUUID();
    await db.insert(leaveRequests).values({
      id, agencyId, employeeId, type,
      startDate, endDate, days,
      status: 'pending',
      notes: body.notes ?? null,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'leave_request_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
