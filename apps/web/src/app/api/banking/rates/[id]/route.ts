import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRates } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const body = await request.json() as { rate?: number; effectiveDate?: string };
    const updates: Record<string, unknown> = {};
    if (body.rate !== undefined) {
      if (!Number.isFinite(body.rate) || body.rate <= 0) {
        return NextResponse.json({ error: 'سعر الصرف غير صالح' }, { status: 400 });
      }
      updates.rate = Math.round(body.rate * 10000);
    }
    if (body.effectiveDate) {
      if (Number.isNaN(Date.parse(body.effectiveDate))) {
        return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 });
      }
      updates.effectiveDate = body.effectiveDate;
    }
    await db.transaction(async (tx) => {
      await tx.update(exchangeRates).set(updates as Partial<typeof exchangeRates.$inferInsert>)
        .where(and(eq(exchangeRates.id, params.id), eq(exchangeRates.agencyId, agencyId)));
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
