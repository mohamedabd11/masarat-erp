import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupTrips, groupTripMembers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string; memberId: string } };

const VALID_VISA_STATUSES = new Set(['pending', 'applied', 'approved', 'received', 'rejected']);
const VALID_MEMBER_STATUSES = new Set(['registered', 'confirmed', 'cancelled']);
const VALID_ROOM_TYPES = new Set(['single', 'double', 'triple', 'quad']);

// ── PATCH — update member ─────────────────────────────────────────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);
    const { id: groupTripId, memberId } = params;

    // Verify trip belongs to agency
    const [trip] = await db.select({ id: groupTrips.id, status: groupTrips.status })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, groupTripId), eq(groupTrips.agencyId, agencyId)));
    if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    if (trip.status === 'cancelled') {
      return NextResponse.json({ error: 'لا يمكن تعديل أعضاء رحلة ملغاة' }, { status: 422 });
    }

    const [member] = await db.select({ id: groupTripMembers.id })
      .from(groupTripMembers)
      .where(and(
        eq(groupTripMembers.id, memberId),
        eq(groupTripMembers.groupTripId, groupTripId),
        eq(groupTripMembers.agencyId, agencyId),
      ));
    if (!member) return NextResponse.json({ error: 'العضو غير موجود' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const now  = new Date();

    if (body['visaStatus'] !== undefined && !VALID_VISA_STATUSES.has(body['visaStatus'] as string)) {
      return NextResponse.json({ error: 'حالة التأشيرة غير صالحة' }, { status: 400 });
    }
    if (body['status'] !== undefined && !VALID_MEMBER_STATUSES.has(body['status'] as string)) {
      return NextResponse.json({ error: 'حالة العضو غير صالحة' }, { status: 400 });
    }
    if (body['roomType'] !== undefined && body['roomType'] !== null && !VALID_ROOM_TYPES.has(body['roomType'] as string)) {
      return NextResponse.json({ error: 'نوع الغرفة غير صالح' }, { status: 400 });
    }

    const STRIP = new Set(['id', 'agencyId', 'groupTripId', 'createdBy', 'createdAt']);
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, v] of Object.entries(body)) {
      if (!STRIP.has(k)) patch[k] = v;
    }

    await db.update(groupTripMembers)
      .set(patch as Partial<typeof groupTripMembers.$inferInsert>)
      .where(and(
        eq(groupTripMembers.id, memberId),
        eq(groupTripMembers.agencyId, agencyId),
      ));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── DELETE — remove member ────────────────────────────────────────────────────
export async function DELETE(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);
    const { id: groupTripId, memberId } = params;

    const [trip] = await db.select({ id: groupTrips.id, status: groupTrips.status })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, groupTripId), eq(groupTrips.agencyId, agencyId)));
    if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    if (trip.status === 'cancelled' || trip.status === 'completed') {
      return NextResponse.json({ error: 'لا يمكن حذف أعضاء من رحلة منتهية أو ملغاة' }, { status: 422 });
    }

    const [member] = await db.select({ id: groupTripMembers.id })
      .from(groupTripMembers)
      .where(and(
        eq(groupTripMembers.id, memberId),
        eq(groupTripMembers.groupTripId, groupTripId),
        eq(groupTripMembers.agencyId, agencyId),
      ));
    if (!member) return NextResponse.json({ error: 'العضو غير موجود' }, { status: 404 });

    await db.delete(groupTripMembers)
      .where(and(
        eq(groupTripMembers.id, memberId),
        eq(groupTripMembers.agencyId, agencyId),
      ));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
