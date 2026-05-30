import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as Record<string, unknown>;
    const now  = new Date();

    const [existing] = await db
      .select({ id: quotes.id, status: quotes.status })
      .from(quotes)
      .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'عرض السعر غير موجود' }, { status: 404 });

    // Prevent converting an already-converted quote
    if (body['status'] === 'converted' && existing.status === 'converted') {
      return NextResponse.json({ error: 'تم تحويل عرض السعر هذا مسبقاً' }, { status: 422 });
    }

    // Strip fields callers should not set directly
    const STRIP = new Set(['id', 'agencyId', 'quoteNumber', 'createdBy', 'createdAt']);
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, v] of Object.entries(body)) {
      if (!STRIP.has(k)) patch[k] = v;
    }

    await db
      .update(quotes)
      .set(patch as Partial<typeof quotes.$inferInsert>)
      .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
