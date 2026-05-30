import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url = new URL(request.url);
    const bookingId = url.searchParams.get('bookingId') ?? undefined;
    const conditions = [eq(supplierPayments.agencyId, agencyId)];
    if (bookingId) conditions.push(eq(supplierPayments.bookingId, bookingId));
    const rows = await db.select().from(supplierPayments)
      .where(and(...conditions)).orderBy(desc(supplierPayments.createdAt));
    return NextResponse.json({ payments: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
