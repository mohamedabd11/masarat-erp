import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appointments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

const VALID_STATUSES = new Set(['scheduled', 'completed', 'cancelled', 'noshow']);

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [row] = await db.select().from(appointments)
      .where(and(eq(appointments.id, params.id), eq(appointments.agencyId, agencyId)));
    if (!row) return NextResponse.json({ error: 'الموعد غير موجود' }, { status: 404 });
    return NextResponse.json({ appointment: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as Partial<{
      title: string; scheduledAt: string; type: string; status: string;
      customerId: string; customerName: string; assignedTo: string;
      description: string; durationMin: number; location: string;
      notes: string; outcome: string;
    }>;

    if (body.status && !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'حالة الموعد غير صالحة' }, { status: 400 });
    }

    const [existing] = await db.select().from(appointments)
      .where(and(eq(appointments.id, params.id), eq(appointments.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الموعد غير موجود' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const ALLOWED = ['title','type','status','customerId','customerName','assignedTo',
      'description','durationMin','location','notes','outcome'] as const;
    for (const k of ALLOWED) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (body.scheduledAt) patch['scheduledAt'] = new Date(body.scheduledAt);

    await db.update(appointments)
      .set(patch as Partial<typeof appointments.$inferInsert>)
      .where(and(eq(appointments.id, params.id), eq(appointments.agencyId, agencyId)));

    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'appointment', resourceId: params.id, before: existing, after: patch });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const [existing] = await db.select().from(appointments)
      .where(and(eq(appointments.id, params.id), eq(appointments.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الموعد غير موجود' }, { status: 404 });
    await db.delete(appointments).where(and(eq(appointments.id, params.id), eq(appointments.agencyId, agencyId)));
    await logAudit({ agencyId, userId: uid, action: 'delete', resource: 'appointment', resourceId: params.id, before: existing });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
