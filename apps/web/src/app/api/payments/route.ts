import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const conditions = [eq(payments.agencyId, agencyId)];
    if (customerId) conditions.push(eq(payments.customerId, customerId));

    const rows = await db
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt));
    return NextResponse.json({ payments: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
