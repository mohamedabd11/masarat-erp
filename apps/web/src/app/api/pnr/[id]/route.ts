import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { logTravelEvent } from '@/lib/travel-event-log';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [row] = await db.select().from(pnrRecords)
      .where(and(
        eq(pnrRecords.id, params.id),
        eq(pnrRecords.agencyId, agencyId),
        isNull(pnrRecords.deletedAt),
      ));
    if (!row) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });
    return NextResponse.json({ pnr: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

const VALID_STATUS = new Set(['active', 'ticketed', 'cancelled', 'refunded']);
// 'expired' is NOT patchable via API — set by cron job only
// 'voided'  is NOT patchable via API — set by ticket void flow only

const ALLOWED_PATCH = [
  'gds', 'airline', 'flightNumbers', 'origin', 'destination',
  'departureDate', 'returnDate', 'passengerCount', 'passengerNames',
  'ticketNumbers', 'fareHalalas', 'taxHalalas', 'totalHalalas',
  'bookingId', 'customerId', 'status', 'expiresAt', 'notes',
  'syncStatus', 'segments', 'passengers',
] as const;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as Record<string, unknown>;

    if (body['status'] && !VALID_STATUS.has(body['status'] as string)) {
      return NextResponse.json({ error: 'حالة PNR غير صالحة' }, { status: 400 });
    }

    const [existing] = await db.select().from(pnrRecords)
      .where(and(
        eq(pnrRecords.id, params.id),
        eq(pnrRecords.agencyId, agencyId),
        isNull(pnrRecords.deletedAt),
      ));
    if (!existing) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ALLOWED_PATCH) {
      if (body[k] !== undefined) {
        // expiresAt arrives as ISO string from client; Drizzle timestamp requires Date
        patch[k] = k === 'expiresAt' && typeof body[k] === 'string'
          ? new Date(body[k] as string)
          : body[k];
      }
    }

    // Auto-set cancelledAt/cancelledBy when transitioning to cancelled
    if (body['status'] === 'cancelled' && existing.status !== 'cancelled') {
      patch['cancelledAt'] = new Date();
      patch['cancelledBy'] = uid;
    }

    await db.update(pnrRecords)
      .set(patch as Partial<typeof pnrRecords.$inferInsert>)
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'update',
      resource:   'pnr',
      resourceId: params.id,
      before:     existing,
      after:      patch,
    });

    // Travel event side-effects (non-blocking)
    if (body['bookingId'] !== undefined && body['bookingId'] !== existing.bookingId) {
      void logTravelEvent({ agencyId, eventType: 'pnr_linked_to_booking', provider: existing.gds ?? undefined, resourceId: params.id, resourceType: 'pnr', actorId: uid, payload: { bookingId: body['bookingId'] } });
    }
    if (body['customerId'] !== undefined && body['customerId'] !== existing.customerId) {
      void logTravelEvent({ agencyId, eventType: 'pnr_linked_to_customer', provider: existing.gds ?? undefined, resourceId: params.id, resourceType: 'pnr', actorId: uid, payload: { customerId: body['customerId'] } });
    }
    if (body['status'] === 'cancelled' && existing.status !== 'cancelled') {
      void logTravelEvent({ agencyId, eventType: 'pnr_cancelled', provider: existing.gds ?? undefined, resourceId: params.id, resourceType: 'pnr', actorId: uid });
    }

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
      .where(and(
        eq(pnrRecords.id, params.id),
        eq(pnrRecords.agencyId, agencyId),
        isNull(pnrRecords.deletedAt),
      ));
    if (!existing) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });

    // Soft-delete only — PNR records are financial commitments
    await db.update(pnrRecords)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));

    await logAudit({ agencyId, userId: uid, action: 'delete', resource: 'pnr', resourceId: params.id, before: existing });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
