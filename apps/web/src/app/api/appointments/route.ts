import { NextResponse } from 'next/server';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appointments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

const VALID_TYPES   = new Set(['meeting', 'call', 'followup', 'booking', 'other']);
const VALID_STATUSES = new Set(['scheduled', 'completed', 'cancelled', 'noshow']);

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const url        = new URL(request.url);
    const customerId = url.searchParams.get('customerId') ?? undefined;
    const assignedTo = url.searchParams.get('assignedTo') ?? undefined;
    const status     = url.searchParams.get('status')     ?? undefined;
    const from       = url.searchParams.get('from')       ?? undefined;
    const to         = url.searchParams.get('to')         ?? undefined;

    const conditions = [eq(appointments.agencyId, agencyId)];
    if (customerId) conditions.push(eq(appointments.customerId, customerId));
    if (assignedTo) conditions.push(eq(appointments.assignedTo, assignedTo));
    if (status)     conditions.push(eq(appointments.status, status));
    if (from)       conditions.push(gte(appointments.scheduledAt, new Date(from)));
    if (to)         conditions.push(lte(appointments.scheduledAt, new Date(to)));

    const rows = await db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .orderBy(desc(appointments.scheduledAt))
      .limit(300);

    return NextResponse.json({ appointments: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const body = await request.json() as {
      title:        string;
      scheduledAt:  string;
      type?:        string;
      customerId?:  string;
      customerName?: string;
      assignedTo?:  string;
      description?: string;
      durationMin?: number;
      location?:    string;
      notes?:       string;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'عنوان الموعد مطلوب' }, { status: 400 });
    }
    if (!body.scheduledAt) {
      return NextResponse.json({ error: 'تاريخ ووقت الموعد مطلوبان' }, { status: 400 });
    }
    const type = body.type ?? 'meeting';
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json({ error: 'نوع الموعد غير صالح' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(appointments).values({
      id,
      agencyId,
      title:        body.title.trim(),
      scheduledAt:  new Date(body.scheduledAt),
      type,
      customerId:   body.customerId   ?? null,
      customerName: body.customerName ?? null,
      assignedTo:   body.assignedTo   ?? null,
      description:  body.description  ?? null,
      durationMin:  body.durationMin  ?? 30,
      location:     body.location     ?? null,
      notes:        body.notes        ?? null,
      createdBy:    uid,
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'appointment', resourceId: id, after: { title: body.title } });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'appointment_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
