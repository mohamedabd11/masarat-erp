import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, bookingPassengers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string } };

// ── GET — list all passengers for a booking ─────────────────────────────────
export async function GET(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId } = await verifyAuth(req);
    const bookingId = params.id;

    const [booking] = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    const passengers = await db.select()
      .from(bookingPassengers)
      .where(and(eq(bookingPassengers.bookingId, bookingId), eq(bookingPassengers.agencyId, agencyId)))
      .orderBy(asc(bookingPassengers.createdAt));

    return NextResponse.json({ passengers });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST — add a passenger to the booking ──────────────────────────────────
export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { uid, agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);
    const bookingId = params.id;

    const [booking] = await db.select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'لا يمكن إضافة مسافر لحجز ملغى' }, { status: 400 });
    }

    const body = await req.json() as Record<string, unknown>;
    const nameAr = (body['nameAr'] as string | undefined)?.trim();
    if (!nameAr) return NextResponse.json({ error: 'اسم المسافر (عربي) مطلوب' }, { status: 400 });

    const typeVal = (body['type'] as string | undefined) ?? 'ADT';
    if (!['ADT', 'CHD', 'INF'].includes(typeVal)) {
      return NextResponse.json({ error: 'نوع المسافر يجب أن يكون ADT أو CHD أو INF' }, { status: 400 });
    }

    const now = new Date();
    const [created] = await db.insert(bookingPassengers).values({
      id:             crypto.randomUUID(),
      agencyId,
      bookingId,
      nameAr,
      nameEn:         (body['nameEn']         as string | undefined)?.trim()  || null,
      type:           typeVal,
      gender:         (body['gender']         as string | undefined) || null,
      passportNumber: (body['passportNumber'] as string | undefined)?.trim()  || null,
      passportExpiry: (body['passportExpiry'] as string | undefined)?.trim()  || null,
      nationality:    (body['nationality']    as string | undefined)?.trim()  || null,
      dateOfBirth:    (body['dateOfBirth']    as string | undefined)?.trim()  || null,
      nationalId:     (body['nationalId']     as string | undefined)?.trim()  || null,
      notes:          (body['notes']          as string | undefined)?.trim()  || null,
      createdAt:      now,
      updatedAt:      now,
      createdBy:      uid,
    }).returning();

    return NextResponse.json({ passenger: created }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_passenger_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
