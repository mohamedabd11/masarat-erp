import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

/**
 * Reports dashboard aggregation — server-side GROUP BY for the reports page.
 *
 * Replaces the previous client-side approach that fetched `/api/invoices`
 * (paginated, capped at 50 rows) and aggregated in the browser — which silently
 * truncated every revenue/VAT chart to the first page of invoices.
 *
 * Cancelled invoices/bookings are excluded (they are reversed and are not revenue).
 * Month/year bucketing is done at the stored (UTC) value of created_at, which is
 * deterministic across users (the old browser-local bucketing was not).
 *
 * Access parity: any authenticated agency user with the `reports` feature can read
 * this — matching the prior effective access of the reports page. RBAC tightening
 * is tracked separately.
 */
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'reports', db);

    const url       = new URL(request.url);
    const yearParam = parseInt(url.searchParams.get('year') ?? '', 10);
    const year      = Number.isInteger(yearParam) ? yearParam : new Date().getFullYear();
    if (year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'سنة غير صالحة' }, { status: 400 });
    }

    // Face-value timestamp bounds — compared as `timestamp` (created_at has no tz).
    const yearStart = `${year}-01-01 00:00:00`;
    const yearEnd   = `${year + 1}-01-01 00:00:00`;

    // ── Monthly aggregation (invoices, cost from the linked booking) ────────────
    const monthlyRaw = await db
      .select({
        month:      sql<number>`EXTRACT(MONTH FROM ${invoices.createdAt})::int`,
        cnt:        sql<string>`COUNT(${invoices.id})`,
        rev:        sql<string>`COALESCE(SUM(${invoices.subtotalHalalas}), 0)`,
        vat:        sql<string>`COALESCE(SUM(${invoices.vatHalalas}), 0)`,
        grandTotal: sql<string>`COALESCE(SUM(${invoices.totalHalalas}), 0)`,
        cost:       sql<string>`COALESCE(SUM(${bookings.costPriceHalalas}), 0)`,
      })
      .from(invoices)
      .leftJoin(bookings, eq(bookings.id, invoices.bookingId))
      .where(and(
        eq(invoices.agencyId, agencyId),
        ne(invoices.status, 'cancelled'),
        sql`${invoices.createdAt} >= ${yearStart}`,
        sql`${invoices.createdAt} <  ${yearEnd}`,
      ))
      .groupBy(sql`EXTRACT(MONTH FROM ${invoices.createdAt})`);

    // ── Service-type mix (bookings) ─────────────────────────────────────────────
    const typeRaw = await db
      .select({
        type: bookings.serviceType,
        cnt:  sql<string>`COUNT(${bookings.id})`,
        rev:  sql<string>`COALESCE(SUM(${bookings.totalPriceHalalas}), 0)`,
      })
      .from(bookings)
      .where(and(
        eq(bookings.agencyId, agencyId),
        ne(bookings.status, 'cancelled'),
        sql`${bookings.createdAt} >= ${yearStart}`,
        sql`${bookings.createdAt} <  ${yearEnd}`,
      ))
      .groupBy(bookings.serviceType);

    // ── VAT invoice list for the year (VAT-return tab filters by sub-range) ──────
    const vatRows = await db
      .select({
        id:              invoices.id,
        invoiceNumber:   invoices.invoiceNumber,
        subtotalHalalas: invoices.subtotalHalalas,
        vatHalalas:      invoices.vatHalalas,
        totalHalalas:    invoices.totalHalalas,
        status:          invoices.status,
        createdAt:       invoices.createdAt,
      })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        ne(invoices.status, 'cancelled'),
        sql`${invoices.createdAt} >= ${yearStart}`,
        sql`${invoices.createdAt} <  ${yearEnd}`,
      ))
      .orderBy(invoices.createdAt);

    return NextResponse.json({
      year,
      monthly: monthlyRaw.map((r) => ({
        month:      Number(r.month),        // 1–12
        bookings:   Number(r.cnt),
        rev:        Number(r.rev),
        vat:        Number(r.vat),
        grandTotal: Number(r.grandTotal),
        cost:       Number(r.cost),
      })),
      typeMix: typeRaw.map((r) => ({
        type:  r.type,
        count: Number(r.cnt),
        rev:   Number(r.rev),
      })),
      vatInvoices: vatRows,
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'reports_dashboard_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
