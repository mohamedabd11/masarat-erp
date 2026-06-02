import { NextResponse } from 'next/server';
import { eq, and, sql, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

/**
 * Booking Profitability Report (ربحية الحجوزات)
 *
 * Returns booking-level and aggregated margin data.
 * groupBy: 'booking' | 'serviceType' | 'employee' | 'month'
 */
export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'financial_reports', db);

    const url     = new URL(request.url);
    const currentYear = new Date().getFullYear();
    const from    = url.searchParams.get('from')    ?? `${currentYear}-01-01`;
    const to      = url.searchParams.get('to')      ?? `${currentYear}-12-31`;
    const groupBy = url.searchParams.get('groupBy') ?? 'serviceType'; // booking|serviceType|employee|month
    const limit   = Math.min(Number(url.searchParams.get('limit') ?? '200'), 500);

    const baseWhere = and(
      eq(bookings.agencyId, agencyId),
      ne(bookings.status, 'cancelled'),
      sql`cast(${bookings.createdAt} as date) >= ${from}::date`,
      sql`cast(${bookings.createdAt} as date) <= ${to}::date`,
    );

    if (groupBy === 'serviceType') {
      const rows = await db
        .select({
          serviceType:       bookings.serviceType,
          bookingCount:      sql<number>`cast(count(*) as int)`,
          totalRevenue:      sql<number>`cast(coalesce(sum(${bookings.totalPriceHalalas}), 0) as bigint)`,
          totalCost:         sql<number>`cast(coalesce(sum(${bookings.costPriceHalalas}),  0) as bigint)`,
          totalProfit:       sql<number>`cast(coalesce(sum(${bookings.profitHalalas}),     0) as bigint)`,
          totalPaid:         sql<number>`cast(coalesce(sum(${bookings.paidHalalas}),       0) as bigint)`,
        })
        .from(bookings)
        .where(baseWhere)
        .groupBy(bookings.serviceType)
        .orderBy(sql`sum(${bookings.profitHalalas}) desc`);

      const totals = rows.reduce((acc, r) => ({
        bookingCount: acc.bookingCount + Number(r.bookingCount),
        totalRevenue: acc.totalRevenue + Number(r.totalRevenue),
        totalCost:    acc.totalCost    + Number(r.totalCost),
        totalProfit:  acc.totalProfit  + Number(r.totalProfit),
      }), { bookingCount: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 });

      return NextResponse.json({
        from, to, groupBy,
        rows: rows.map(r => ({
          ...r,
          bookingCount: Number(r.bookingCount),
          totalRevenue: Number(r.totalRevenue),
          totalCost:    Number(r.totalCost),
          totalProfit:  Number(r.totalProfit),
          totalPaid:    Number(r.totalPaid),
          marginPct:    Number(r.totalRevenue) > 0
            ? Math.round(Number(r.totalProfit) / Number(r.totalRevenue) * 10000) / 100
            : 0,
        })),
        totals,
      });
    }

    if (groupBy === 'employee') {
      const rows = await db
        .select({
          employeeId:    bookings.createdBy,
          bookingCount:  sql<number>`cast(count(*) as int)`,
          totalRevenue:  sql<number>`cast(coalesce(sum(${bookings.totalPriceHalalas}), 0) as bigint)`,
          totalCost:     sql<number>`cast(coalesce(sum(${bookings.costPriceHalalas}),  0) as bigint)`,
          totalProfit:   sql<number>`cast(coalesce(sum(${bookings.profitHalalas}),     0) as bigint)`,
        })
        .from(bookings)
        .where(baseWhere)
        .groupBy(bookings.createdBy)
        .orderBy(sql`sum(${bookings.profitHalalas}) desc`);

      return NextResponse.json({
        from, to, groupBy,
        rows: rows.map(r => ({
          employeeId:   r.employeeId ?? 'unknown',
          bookingCount: Number(r.bookingCount),
          totalRevenue: Number(r.totalRevenue),
          totalCost:    Number(r.totalCost),
          totalProfit:  Number(r.totalProfit),
          marginPct:    Number(r.totalRevenue) > 0
            ? Math.round(Number(r.totalProfit) / Number(r.totalRevenue) * 10000) / 100
            : 0,
        })),
      });
    }

    if (groupBy === 'month') {
      const rows = await db
        .select({
          month:         sql<string>`to_char(${bookings.createdAt}, 'YYYY-MM')`,
          bookingCount:  sql<number>`cast(count(*) as int)`,
          totalRevenue:  sql<number>`cast(coalesce(sum(${bookings.totalPriceHalalas}), 0) as bigint)`,
          totalCost:     sql<number>`cast(coalesce(sum(${bookings.costPriceHalalas}),  0) as bigint)`,
          totalProfit:   sql<number>`cast(coalesce(sum(${bookings.profitHalalas}),     0) as bigint)`,
        })
        .from(bookings)
        .where(baseWhere)
        .groupBy(sql`to_char(${bookings.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${bookings.createdAt}, 'YYYY-MM')`);

      return NextResponse.json({
        from, to, groupBy,
        rows: rows.map(r => ({
          ...r,
          bookingCount: Number(r.bookingCount),
          totalRevenue: Number(r.totalRevenue),
          totalCost:    Number(r.totalCost),
          totalProfit:  Number(r.totalProfit),
          marginPct:    Number(r.totalRevenue) > 0
            ? Math.round(Number(r.totalProfit) / Number(r.totalRevenue) * 10000) / 100
            : 0,
        })),
      });
    }

    // Default: booking-level detail
    const rows = await db
      .select({
        id:             bookings.id,
        bookingNumber:  bookings.bookingNumber,
        serviceType:    bookings.serviceType,
        customerNameAr: bookings.customerNameAr,
        status:         bookings.status,
        createdBy:      bookings.createdBy,
        totalRevenue:   bookings.totalPriceHalalas,
        totalCost:      bookings.costPriceHalalas,
        totalProfit:    bookings.profitHalalas,
        paidHalalas:    bookings.paidHalalas,
        createdAt:      bookings.createdAt,
      })
      .from(bookings)
      .where(baseWhere)
      .orderBy(sql`${bookings.profitHalalas} desc`)
      .limit(limit);

    return NextResponse.json({
      from, to, groupBy,
      rows: rows.map(r => ({
        ...r,
        marginPct: r.totalRevenue > 0
          ? Math.round(r.totalProfit / r.totalRevenue * 10000) / 100
          : 0,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_profitability_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
