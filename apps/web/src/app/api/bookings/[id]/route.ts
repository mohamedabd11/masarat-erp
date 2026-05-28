import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    // Reconstruct pricing object from stored details + numeric columns
    const det = (booking.details ?? {}) as Record<string, unknown>;
    const enriched = {
      ...booking,
      pricing: {
        revenueModel: String(det['revenueModel'] ?? 'principal'),
        currency:     String(det['currency']     ?? 'SAR'),
        totalCost:    booking.costPriceHalalas,
        serviceFee:   Number(det['serviceFee']   ?? 0),
        vatAmount:    Number(det['vatAmount']     ?? 0),
        totalAmount:  booking.totalPriceHalalas,
        commission:   Number(det['serviceFee']   ?? 0),
      },
    };
    return NextResponse.json({ booking: enriched });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as Record<string, unknown>;
    const now = new Date();
    await db.update(bookings).set({ ...body as Partial<typeof bookings.$inferInsert>, updatedAt: now })
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
