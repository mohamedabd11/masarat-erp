import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'payments', db);
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
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
