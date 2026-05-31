import { NextResponse } from 'next/server';
import { eq, and, desc, count, sum, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customers, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const search     = url.searchParams.get('q')          ?? undefined;
    const showAll    = url.searchParams.get('showAll')    === 'true';
    const page       = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1',  10) || 1);
    const pageSize   = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset     = (page - 1) * pageSize;

    const conditions = [eq(customers.agencyId, agencyId)];
    // By default, show only active customers; pass ?showAll=true for all
    if (!showAll) conditions.push(eq(customers.isActive, true));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(ilike(customers.nameAr, pattern), ilike(customers.nameEn, pattern), ilike(customers.phone, pattern))!,
      );
    }

    const [{ total }] = await db
      .select({ total: count(customers.id) })
      .from(customers)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Aggregate stats only for the returned page (not all customers)
    const customerIds = rows.map(c => c.id);
    const bookingStats = customerIds.length > 0
      ? await db
          .select({
            customerId:   bookings.customerId,
            bookingCount: count(bookings.id),
            totalSpent:   sum(bookings.totalPriceHalalas),
          })
          .from(bookings)
          .where(and(eq(bookings.agencyId, agencyId)))
          .groupBy(bookings.customerId)
      : [];

    const statsMap = new Map(bookingStats.map(s => [s.customerId, s]));

    const result = rows.map(c => ({
      ...c,
      bookingCount:      statsMap.get(c.id)?.bookingCount ?? 0,
      totalSpentHalalas: Number(statsMap.get(c.id)?.totalSpent ?? 0),
    }));

    return NextResponse.json({
      customers: result,
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'customers_list_error', error: String(err) }));
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
