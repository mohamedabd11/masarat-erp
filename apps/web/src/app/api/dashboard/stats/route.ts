import { NextResponse } from 'next/server';
import { eq, and, gte, lt, sql, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    // Use UTC month boundaries to avoid timezone drift
    const now   = new Date();
    const y     = now.getUTCFullYear();
    const m     = now.getUTCMonth();
    const startOfMonth = new Date(Date.UTC(y, m, 1));
    const startOfNext  = new Date(Date.UTC(y, m + 1, 1));

    // Monthly invoice revenue + VAT (current UTC month only)
    const [monthAgg] = await db
      .select({
        revenue: sum(invoices.subtotalHalalas),
        vat:     sum(invoices.vatHalalas),
        cost:    sum(invoices.subtotalHalalas), // will join below for cost
      })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        gte(invoices.createdAt, startOfMonth),
        lt(invoices.createdAt, startOfNext),
        sql`${invoices.status} NOT IN ('cancelled','refunded')`,
      ));

    const monthRevenue = Number(monthAgg?.revenue ?? 0);
    const monthVat     = Number(monthAgg?.vat     ?? 0);

    // Monthly profit: join bookings to get cost for invoices issued this month
    const monthBookingRows = await db
      .select({
        totalPriceHalalas: bookings.totalPriceHalalas,
        costPriceHalalas:  bookings.costPriceHalalas,
        status:            bookings.status,
      })
      .from(bookings)
      .where(and(
        eq(bookings.agencyId, agencyId),
        gte(bookings.createdAt, startOfMonth),
        lt(bookings.createdAt, startOfNext),
        sql`${bookings.status} NOT IN ('cancelled')`,
      ));

    let monthCost = 0;
    for (const bk of monthBookingRows) {
      monthCost += bk.costPriceHalalas;
    }
    const monthProfit = monthRevenue - monthCost;

    // AR outstanding (total - paid - credited across all non-cancelled invoices).
    // Credit notes (creditedHalalas) reduce the receivable without being cash.
    const arRows = await db
      .select({ total: invoices.totalHalalas, paid: invoices.paidHalalas, credited: invoices.creditedHalalas })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        sql`${invoices.status} NOT IN ('cancelled','refunded','paid')`,
      ));

    const arOutstanding = arRows.reduce((s, r) => s + Math.max(0, r.total - r.paid - r.credited), 0);

    // Active (confirmed, current month created) + pending (draft) bookings
    const bkRows = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(and(
        eq(bookings.agencyId, agencyId),
        gte(bookings.createdAt, startOfMonth),
        lt(bookings.createdAt, startOfNext),
      ));

    let activeBookings  = 0;
    let pendingBookings = 0;
    for (const bk of bkRows) {
      if (bk.status === 'confirmed') activeBookings++;
      if (bk.status === 'draft')     pendingBookings++;
    }

    return NextResponse.json({
      stats: { monthRevenue, monthVat, monthCost, monthProfit, activeBookings, pendingBookings, arOutstanding },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
