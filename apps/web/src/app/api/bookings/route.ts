import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const status     = url.searchParams.get('status')     ?? undefined;
    const type       = url.searchParams.get('type')       ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const conditions = [eq(bookings.agencyId, agencyId)];
    if (status)     conditions.push(eq(bookings.status, status));
    if (type)       conditions.push(eq(bookings.serviceType, type));
    if (customerId) conditions.push(eq(bookings.customerId, customerId));

    const rows = await db
      .select()
      .from(bookings)
      .where(and(...conditions))
      .orderBy(desc(bookings.createdAt));

    return NextResponse.json({ bookings: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
