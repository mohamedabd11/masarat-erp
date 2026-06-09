import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, customerMessages } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string } };

// ── GET — list all messages for a booking ────────────────────────────────────
export async function GET(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId } = await verifyAuth(req);
    const bookingId = params.id;

    const [booking] = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    const messages = await db.select()
      .from(customerMessages)
      .where(and(eq(customerMessages.bookingId, bookingId), eq(customerMessages.agencyId, agencyId)))
      .orderBy(desc(customerMessages.sentAt));

    return NextResponse.json({ messages });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST — log a sent message for the booking ────────────────────────────────
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
      return NextResponse.json({ error: 'لا يمكن إرسال رسائل لحجز ملغى' }, { status: 400 });
    }

    const body = await req.json() as Record<string, unknown>;

    const recipientName = (body['recipientName'] as string | undefined)?.trim();
    if (!recipientName) return NextResponse.json({ error: 'اسم المستلم مطلوب' }, { status: 400 });

    const messageAr = (body['messageAr'] as string | undefined)?.trim();
    if (!messageAr) return NextResponse.json({ error: 'نص الرسالة (عربي) مطلوب' }, { status: 400 });

    const channel = (body['channel'] as string | undefined);
    if (!channel || !['whatsapp', 'copy'].includes(channel)) {
      return NextResponse.json({ error: 'قناة الإرسال يجب أن تكون whatsapp أو copy' }, { status: 400 });
    }

    const now = new Date();
    const [created] = await db.insert(customerMessages).values({
      id:             crypto.randomUUID(),
      agencyId,
      bookingId,
      recipientName,
      recipientPhone: (body['recipientPhone'] as string | undefined)?.trim() || null,
      channel,
      templateKey:    (body['templateKey']    as string | undefined)?.trim() || null,
      messageAr,
      messageEn:      (body['messageEn']      as string | undefined)?.trim() || null,
      sentAt:         now,
      sentBy:         uid,
      createdAt:      now,
    }).returning();

    return NextResponse.json({ message: created }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_message_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
