import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const status     = url.searchParams.get('status')     ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const conditions = [eq(invoices.agencyId, agencyId)];
    if (status)     conditions.push(eq(invoices.status, status));
    if (customerId) conditions.push(eq(invoices.customerId, customerId));

    const rows = await db
      .select()
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt));

    return NextResponse.json({ invoices: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
