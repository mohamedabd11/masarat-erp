import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, ticketCoupons } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId)));

    if (!ticket) {
      return NextResponse.json({ error: 'التذكرة غير موجودة' }, { status: 404 });
    }

    const coupons = await db
      .select()
      .from(ticketCoupons)
      .where(eq(ticketCoupons.ticketId, params.id));

    return NextResponse.json({ ticket, coupons });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
