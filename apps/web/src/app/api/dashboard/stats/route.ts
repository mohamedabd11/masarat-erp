import { NextResponse } from 'next/server';
import { eq, and, gte, lt, sql, sum, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  invoices, bookings,
  journalLines, journalEntries, chartOfAccounts,
} from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    // Use UTC month boundaries to avoid timezone drift
    const now  = new Date();
    const y    = now.getUTCFullYear();
    const m    = now.getUTCMonth(); // 0-based

    const startOfMonth = new Date(Date.UTC(y, m, 1));
    const startOfNext  = new Date(Date.UTC(y, m + 1, 1));

    // ISO date strings for journal_entries.date (TEXT 'YYYY-MM-DD')
    const startMonthStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endMonthStr   = m === 11
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 2).padStart(2, '0')}-01`;

    // ── Gross bookings: total invoiced to customers this month ────────────────
    // This is NOT the agency's revenue — it includes the ticket/service cost
    // that is a pass-through to the supplier (agent model, IFRS 15).
    const [invoiceAgg] = await db
      .select({
        grossBookings: sum(invoices.subtotalHalalas),
        vat:           sum(invoices.vatHalalas),
      })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        gte(invoices.createdAt, startOfMonth),
        lt(invoices.createdAt, startOfNext),
        sql`${invoices.status} NOT IN ('cancelled','refunded')`,
      ));

    const monthGrossBookings = Number(invoiceAgg?.grossBookings ?? 0);
    const monthVat           = Number(invoiceAgg?.vat           ?? 0);

    // ── Commission revenue: net credit on revenue accounts in posted JEs ──────
    // Per IFRS 15 agent model, only the earned commission is recognised as
    // revenue (e.g. 700 SAR). The ticket cost (e.g. 6,000) never touches P&L.
    const [revAgg] = await db
      .select({
        credits: sum(journalLines.creditHalalas),
        debits:  sum(journalLines.debitHalalas),
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .innerJoin(chartOfAccounts, and(
        eq(journalLines.accountCode, chartOfAccounts.code),
        eq(journalLines.agencyId,    chartOfAccounts.agencyId),
      ))
      .where(and(
        eq(journalEntries.agencyId, agencyId),
        eq(journalEntries.isPosted, true),
        gte(journalEntries.date, startMonthStr),
        lt(journalEntries.date,  endMonthStr),
        eq(chartOfAccounts.type, 'revenue'),
      ));

    // Net credit on revenue accounts = commission earned this month
    const monthRevenue = Number(revAgg?.credits ?? 0) - Number(revAgg?.debits ?? 0);

    // ── Management margin (not an IFRS P&L figure) ────────────────────────────
    // Gross bookings − ticket cost = agency operating margin.
    // Useful for tracking business volume and supplier cost efficiency.
    const monthBookingRows = await db
      .select({
        costPriceHalalas: bookings.costPriceHalalas,
        status:           bookings.status,
      })
      .from(bookings)
      .innerJoin(invoices, and(
        eq(invoices.bookingId, bookings.id),
        eq(invoices.agencyId,  agencyId),
        sql`${invoices.status} NOT IN ('cancelled','refunded')`,
      ))
      .where(and(
        eq(bookings.agencyId,  agencyId),
        gte(bookings.createdAt, startOfMonth),
        lt(bookings.createdAt,  startOfNext),
        sql`${bookings.status} NOT IN ('cancelled')`,
        isNotNull(invoices.bookingId),
      ));

    let monthCost = 0;
    for (const bk of monthBookingRows) monthCost += bk.costPriceHalalas;
    const monthProfit = monthGrossBookings - monthCost;

    // ── AR outstanding ────────────────────────────────────────────────────────
    const arRows = await db
      .select({ total: invoices.totalHalalas, paid: invoices.paidHalalas })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        sql`${invoices.status} NOT IN ('cancelled','refunded','paid')`,
      ));

    const arOutstanding = arRows.reduce((s, r) => s + Math.max(0, r.total - r.paid), 0);

    // ── Active / pending bookings this month ──────────────────────────────────
    const bkRows = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(and(
        eq(bookings.agencyId,  agencyId),
        gte(bookings.createdAt, startOfMonth),
        lt(bookings.createdAt,  startOfNext),
      ));

    let activeBookings  = 0;
    let pendingBookings = 0;
    for (const bk of bkRows) {
      if (bk.status === 'confirmed') activeBookings++;
      if (bk.status === 'draft')     pendingBookings++;
    }

    return NextResponse.json({
      stats: {
        monthRevenue,        // IFRS 15 agent commission (e.g. 700) — matches P&L
        monthGrossBookings,  // total customer billing (e.g. 6,700) — management KPI
        monthVat,
        monthCost,
        monthProfit,
        activeBookings,
        pendingBookings,
        arOutstanding,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
