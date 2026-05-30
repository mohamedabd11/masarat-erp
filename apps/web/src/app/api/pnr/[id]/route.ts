import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [row] = await db.select().from(pnrRecords)
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));
    if (!row) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });
    return NextResponse.json({ pnr: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as Partial<{
      gds: string; airline: string; flightNumbers: string;
      origin: string; destination: string; departureDate: string;
      returnDate: string; passengerCount: number; passengerNames: string;
      ticketNumbers: string; fareHalalas: number; taxHalalas: number;
      totalHalalas: number; bookingId: string; customerId: string;
      status: string; expiresAt: string; notes: string;
    }>;

    const VALID_STATUS = new Set(['active', 'ticketed', 'cancelled', 'refunded']);
    if (body.status && !VALID_STATUS.has(body.status)) {
      return NextResponse.json({ error: 'حالة PNR غير صالحة' }, { status: 400 });
    }

    const [existing] = await db.select().from(pnrRecords)
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });

    const ALLOWED = ['gds','airline','flightNumbers','flightNumbers','origin','destination',
      'departureDate','returnDate','passengerCount','passengerNames','ticketNumbers',
      'fareHalalas','taxHalalas','totalHalalas','bookingId','customerId','status','expiresAt','notes'] as const;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ALLOWED) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    await db.update(pnrRecords).set(patch as Partial<typeof pnrRecords.$inferInsert>)
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));

    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'pnr', resourceId: params.id, before: existing, after: patch });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const [existing] = await db.select().from(pnrRecords)
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });
    await db.delete(pnrRecords).where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));
    await logAudit({ agencyId, userId: uid, action: 'delete', resource: 'pnr', resourceId: params.id, before: existing });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
