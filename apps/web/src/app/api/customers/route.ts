import { NextResponse } from 'next/server';
import { eq, and, desc, count, sum, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customers, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url    = new URL(request.url);
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1',  10) || 1);
    const limit  = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;

    const [{ total }] = await db
      .select({ total: count() })
      .from(customers)
      .where(and(eq(customers.agencyId, agencyId), isNull(customers.deletedAt)));

    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.agencyId, agencyId), isNull(customers.deletedAt)))
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset);

    const bookingStats = await db
      .select({
        customerId:   bookings.customerId,
        bookingCount: count(bookings.id),
        totalSpent:   sum(bookings.totalPriceHalalas),
      })
      .from(bookings)
      .where(and(eq(bookings.agencyId, agencyId), isNull(bookings.deletedAt)))
      .groupBy(bookings.customerId);

    const statsMap = new Map(bookingStats.map(s => [s.customerId, s]));

    const data = rows.map(c => ({
      ...c,
      bookingCount:      statsMap.get(c.id)?.bookingCount ?? 0,
      totalSpentHalalas: Number(statsMap.get(c.id)?.totalSpent ?? 0),
    }));

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      hasMore: offset + data.length < total,
    });
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
