import { NextResponse } from 'next/server';
import { eq, and, sql, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, supplierPayments } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

/**
 * Supplier Profitability Report (ربحية الموردين)
 *
 * Groups revenue, cost, and profit by supplier based on:
 * - supplierPayments (cost paid to supplier)
 * - bookings linked to supplier via supplierPayments.bookingId
 */
export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'financial_reports', db);

    const url  = new URL(request.url);
    const currentYear = new Date().getFullYear();
    const from = url.searchParams.get('from') ?? `${currentYear}-01-01`;
    const to   = url.searchParams.get('to')   ?? `${currentYear}-12-31`;

    // ── Cost per supplier (from supplier payments) ────────────────────────────
    const costRows = await db
      .select({
        supplierId:   supplierPayments.supplierId,
        supplierName: supplierPayments.supplierName,
        paymentCount: sql<number>`cast(count(*) as int)`,
        totalCost:    sql<number>`cast(coalesce(sum(${supplierPayments.amountHalalas}), 0) as int)`,
      })
      .from(supplierPayments)
      .where(and(
        eq(supplierPayments.agencyId, agencyId),
        ne(supplierPayments.status, 'reversed'),
        sql`${supplierPayments.date} >= ${from}`,
        sql`${supplierPayments.date} <= ${to}`,
      ))
      .groupBy(supplierPayments.supplierId, supplierPayments.supplierName)
      .orderBy(sql`sum(${supplierPayments.amountHalalas}) desc`);

    // ── Revenue per supplier (via bookings linked through supplier payments) ──
    // For each supplier, find bookings where they were paid and sum up booking revenue
    const revenueRows = await db
      .select({
        supplierId:    supplierPayments.supplierId,
        totalRevenue:  sql<number>`cast(coalesce(sum(${bookings.totalPriceHalalas}), 0) as int)`,
        bookingCount:  sql<number>`cast(count(distinct ${bookings.id}) as int)`,
      })
      .from(supplierPayments)
      .innerJoin(bookings, and(
        eq(bookings.id, supplierPayments.bookingId),
        ne(bookings.status, 'cancelled'),
      ))
      .where(and(
        eq(supplierPayments.agencyId, agencyId),
        ne(supplierPayments.status, 'reversed'),
        sql`${supplierPayments.date} >= ${from}`,
        sql`${supplierPayments.date} <= ${to}`,
      ))
      .groupBy(supplierPayments.supplierId);

    const revenueMap = new Map<string, { revenue: number; bookingCount: number }>();
    for (const r of revenueRows) {
      revenueMap.set(r.supplierId ?? '', {
        revenue:      Number(r.totalRevenue),
        bookingCount: Number(r.bookingCount),
      });
    }

    const rows = costRows.map(r => {
      const sid     = r.supplierId ?? '';
      const rev     = revenueMap.get(sid);
      const revenue = rev?.revenue ?? 0;
      const cost    = Number(r.totalCost);
      const profit  = revenue - cost;

      return {
        supplierId:    sid || null,
        supplierName:  r.supplierName ?? 'غير محدد',
        paymentCount:  Number(r.paymentCount),
        bookingCount:  rev?.bookingCount ?? 0,
        totalRevenue:  revenue,
        totalCost:     cost,
        totalProfit:   profit,
        marginPct:     revenue > 0 ? Math.round(profit / revenue * 10000) / 100 : 0,
      };
    });

    const totals = rows.reduce((acc, r) => ({
      totalRevenue: acc.totalRevenue + r.totalRevenue,
      totalCost:    acc.totalCost    + r.totalCost,
      totalProfit:  acc.totalProfit  + r.totalProfit,
    }), { totalRevenue: 0, totalCost: 0, totalProfit: 0 });

    return NextResponse.json({ from, to, rows, totals });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'supplier_profitability_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
