import { NextResponse } from 'next/server';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url = new URL(request.url);
    const bookingId = url.searchParams.get('bookingId') ?? undefined;
    const page     = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset   = (page - 1) * pageSize;

    const conditions = [eq(supplierPayments.agencyId, agencyId)];
    if (bookingId) conditions.push(eq(supplierPayments.bookingId, bookingId));

    const [{ total }] = await db.select({ total: count(supplierPayments.id) })
      .from(supplierPayments).where(and(...conditions));

    const rows = await db.select().from(supplierPayments)
      .where(and(...conditions))
      .orderBy(desc(supplierPayments.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      payments: rows,
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
