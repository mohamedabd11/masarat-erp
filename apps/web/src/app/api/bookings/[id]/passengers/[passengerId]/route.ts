import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookingPassengers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string; passengerId: string } };

// ── PATCH — update a passenger record ──────────────────────────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);

    const [existing] = await db.select({ id: bookingPassengers.id })
      .from(bookingPassengers)
      .where(and(
        eq(bookingPassengers.id, params.passengerId),
        eq(bookingPassengers.bookingId, params.id),
        eq(bookingPassengers.agencyId, agencyId),
      ));
    if (!existing) return NextResponse.json({ error: 'المسافر غير موجود' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const str = (key: string) => {
      if (key in body) patch[key] = (body[key] as string | undefined)?.trim() || null;
    };

    if ('nameAr' in body) {
      const nameAr = (body['nameAr'] as string | undefined)?.trim();
      if (!nameAr) return NextResponse.json({ error: 'اسم المسافر (عربي) مطلوب' }, { status: 400 });
      patch['nameAr'] = nameAr;
    }
    if ('type' in body) {
      const typeVal = body['type'] as string;
      if (!['ADT', 'CHD', 'INF'].includes(typeVal)) {
        return NextResponse.json({ error: 'نوع المسافر غير صالح' }, { status: 400 });
      }
      patch['type'] = typeVal;
    }
    str('nameEn'); str('gender'); str('passportNumber'); str('passportExpiry');
    str('nationality'); str('dateOfBirth'); str('nationalId'); str('notes');

    const [updated] = await db.update(bookingPassengers)
      .set(patch as never)
      .where(and(
        eq(bookingPassengers.id, params.passengerId),
        eq(bookingPassengers.agencyId, agencyId),
      ))
      .returning();

    return NextResponse.json({ passenger: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_passenger_update_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── DELETE — remove a passenger from the booking ───────────────────────────
export async function DELETE(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);

    const [existing] = await db.select({ id: bookingPassengers.id })
      .from(bookingPassengers)
      .where(and(
        eq(bookingPassengers.id, params.passengerId),
        eq(bookingPassengers.bookingId, params.id),
        eq(bookingPassengers.agencyId, agencyId),
      ));
    if (!existing) return NextResponse.json({ error: 'المسافر غير موجود' }, { status: 404 });

    await db.delete(bookingPassengers).where(and(
      eq(bookingPassengers.id, params.passengerId),
      eq(bookingPassengers.agencyId, agencyId),
    ));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_passenger_delete_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
