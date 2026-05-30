import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serviceTypes, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [row] = await db.select().from(serviceTypes)
      .where(and(eq(serviceTypes.id, params.id), eq(serviceTypes.agencyId, agencyId)));
    if (!row) return NextResponse.json({ error: 'نوع الخدمة غير موجود' }, { status: 404 });
    return NextResponse.json({ serviceType: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as Record<string, unknown>;
    await db.update(serviceTypes).set(body as Partial<typeof serviceTypes.$inferInsert>)
      .where(and(eq(serviceTypes.id, params.id), eq(serviceTypes.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);

    // Prevent deletion if any booking references this custom service type
    const [usedByBooking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customTypeId, params.id), eq(bookings.agencyId, agencyId), isNull(bookings.deletedAt)))
      .limit(1);
    if (usedByBooking) {
      return NextResponse.json(
        { error: 'لا يمكن حذف نوع الخدمة لأنه مستخدم في حجز واحد أو أكثر' },
        { status: 422 },
      );
    }

    await db.delete(serviceTypes).where(and(eq(serviceTypes.id, params.id), eq(serviceTypes.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
