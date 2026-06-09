import { NextResponse } from 'next/server';
import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupTrips, groupTripMembers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string } };

const VALID_VISA_STATUSES  = new Set(['pending', 'applied', 'approved', 'received', 'rejected']);
const VALID_ROOM_TYPES     = new Set(['single', 'double', 'triple', 'quad']);

// ── GET — list members ────────────────────────────────────────────────────────
export async function GET(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId } = await verifyAuth(req);
    const { id: groupTripId } = params;

    const [trip] = await db.select({ id: groupTrips.id })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, groupTripId), eq(groupTrips.agencyId, agencyId)));
    if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });

    const members = await db.select()
      .from(groupTripMembers)
      .where(and(
        eq(groupTripMembers.groupTripId, groupTripId),
        eq(groupTripMembers.agencyId, agencyId),
      ))
      .orderBy(asc(groupTripMembers.createdAt));

    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST — add member ─────────────────────────────────────────────────────────
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { uid, agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);
    const { id: groupTripId } = params;

    const [trip] = await db.select({ id: groupTrips.id, status: groupTrips.status, capacity: groupTrips.capacity })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, groupTripId), eq(groupTrips.agencyId, agencyId)));
    if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    if (trip.status === 'cancelled' || trip.status === 'completed') {
      return NextResponse.json({ error: 'لا يمكن إضافة أعضاء لرحلة منتهية أو ملغاة' }, { status: 422 });
    }

    // Capacity check
    if (trip.capacity !== null) {
      const [countRow] = await db.select({ total: sql<number>`count(*)::int` })
        .from(groupTripMembers)
        .where(and(
          eq(groupTripMembers.groupTripId, groupTripId),
          eq(groupTripMembers.agencyId, agencyId),
          sql`${groupTripMembers.status} != 'cancelled'`,
        ));
      if ((countRow?.total ?? 0) >= trip.capacity) {
        return NextResponse.json({ error: `الرحلة وصلت إلى الطاقة الاستيعابية القصوى (${trip.capacity})` }, { status: 400 });
      }
    }

    const body   = await req.json() as Record<string, unknown>;
    const nameAr = (body['nameAr'] as string | undefined)?.trim();
    if (!nameAr) return NextResponse.json({ error: 'الاسم بالعربية مطلوب' }, { status: 400 });

    const visaStatus = (body['visaStatus'] as string | undefined) ?? 'pending';
    if (!VALID_VISA_STATUSES.has(visaStatus)) {
      return NextResponse.json({ error: 'حالة التأشيرة غير صالحة' }, { status: 400 });
    }
    const roomType = (body['roomType'] as string | undefined) ?? null;
    if (roomType && !VALID_ROOM_TYPES.has(roomType)) {
      return NextResponse.json({ error: 'نوع الغرفة غير صالح' }, { status: 400 });
    }

    const now = new Date();
    const [member] = await db.insert(groupTripMembers).values({
      id:             crypto.randomUUID(),
      agencyId,
      groupTripId,
      nameAr,
      nameEn:         (body['nameEn']         as string | undefined)?.trim() || null,
      phone:          (body['phone']          as string | undefined)?.trim() || null,
      passportNumber: (body['passportNumber'] as string | undefined)?.trim() || null,
      passportExpiry: (body['passportExpiry'] as string | undefined)?.trim() || null,
      nationality:    (body['nationality']    as string | undefined)?.trim() || null,
      visaStatus,
      visaNumber:     (body['visaNumber']     as string | undefined)?.trim() || null,
      visaExpiry:     (body['visaExpiry']     as string | undefined)?.trim() || null,
      roomType,
      notes:          (body['notes']          as string | undefined)?.trim() || null,
      status:         'registered',
      createdBy:      uid,
      createdAt:      now,
      updatedAt:      now,
    }).returning();

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'group_trip_member_add_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
