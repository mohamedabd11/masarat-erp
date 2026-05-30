import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRates } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as { rate?: number; effectiveDate?: string };
    const updates: Record<string, unknown> = {};
    if (body.rate !== undefined) updates.rate = Math.round(body.rate * 10000);
    if (body.effectiveDate) updates.effectiveDate = body.effectiveDate;
    await db.update(exchangeRates).set(updates as Partial<typeof exchangeRates.$inferInsert>)
      .where(and(eq(exchangeRates.id, params.id), eq(exchangeRates.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
