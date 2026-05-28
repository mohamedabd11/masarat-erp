import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveRequests } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as { status?: string; notes?: string };

    const [existing] = await db
      .select({ id: leaveRequests.id, status: leaveRequests.status })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'طلب الإجازة غير موجود' }, { status: 404 });

    // Prevent modifying an already-decided request
    if (existing.status !== 'pending' && body.status && body.status !== existing.status) {
      return NextResponse.json(
        { error: `لا يمكن تعديل طلب بحالة "${existing.status}"` },
        { status: 422 },
      );
    }

    if (body.status && !['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch['status'] = body.status;
    if (body.notes  !== undefined) patch['notes']  = body.notes;

    await db
      .update(leaveRequests)
      .set(patch as Partial<typeof leaveRequests.$inferInsert>)
      .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
