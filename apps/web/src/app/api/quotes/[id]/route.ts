import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);
    const body = await request.json() as Record<string, unknown>;
    const now  = new Date();

    const [existing] = await db
      .select({ id: quotes.id, status: quotes.status })
      .from(quotes)
      .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'عرض السعر غير موجود' }, { status: 404 });

    const status = typeof body['status'] === 'string' ? body['status'] : '';
    const allowedStatuses = new Set(['draft', 'sent', 'accepted', 'rejected', 'expired']);
    if (existing.status === 'converted') {
      return NextResponse.json({ error: 'لا يمكن تعديل عرض سعر تم تحويله إلى حجز' }, { status: 422 });
    }
    if (status === 'converted') {
      return NextResponse.json({ error: 'يجب تحويل عرض السعر عبر مسار إنشاء الحجز' }, { status: 422 });
    }
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: 'حالة عرض السعر غير صالحة' }, { status: 400 });
    }

    await db
      .update(quotes)
      .set({ status, updatedAt: now })
      .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
