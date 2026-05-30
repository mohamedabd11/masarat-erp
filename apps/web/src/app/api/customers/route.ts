import { NextResponse } from 'next/server';
import { eq, and, desc, count, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customers, bookings, payments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.agencyId, agencyId))
      .orderBy(desc(customers.createdAt));

    // Aggregate booking counts and total spent per customer
    const bookingStats = await db
      .select({
        customerId:    bookings.customerId,
        bookingCount:  count(bookings.id),
        totalSpent:    sum(bookings.totalPriceHalalas),
      })
      .from(bookings)
      .where(and(eq(bookings.agencyId, agencyId)))
      .groupBy(bookings.customerId);

    const statsMap = new Map(bookingStats.map(s => [s.customerId, s]));

    const result = rows.map(c => ({
      ...c,
      bookingCount:       statsMap.get(c.id)?.bookingCount ?? 0,
      totalSpentHalalas:  Number(statsMap.get(c.id)?.totalSpent ?? 0),
    }));

    return NextResponse.json({ customers: result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; phone?: string; email?: string;
      nationality?: string; nationalId?: string; passportNumber?: string;
      dateOfBirth?: string; notes?: string;
    };
    if (!body.nameAr?.trim()) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    const id = crypto.randomUUID();
    const [row] = await db.insert(customers).values({
      id, agencyId,
      nameAr:         body.nameAr.trim(),
      nameEn:         body.nameEn?.trim() ?? null,
      phone:          body.phone?.trim() ?? null,
      email:          body.email?.trim() ?? null,
      nationality:    body.nationality ?? null,
      nationalId:     body.nationalId ?? null,
      passportNumber: body.passportNumber ?? null,
      dateOfBirth:    body.dateOfBirth ?? null,
      notes:          body.notes ?? null,
    }).returning();
    return NextResponse.json({ success: true, id, customer: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
