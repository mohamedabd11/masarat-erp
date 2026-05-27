import { NextResponse } from 'next/server';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startISO     = startOfMonth.toISOString();

    // Monthly invoice revenue + VAT
    const monthInvRows = await db
      .select({
        subtotalHalalas: invoices.subtotalHalalas,
        vatHalalas:      invoices.vatHalalas,
        paidHalalas:     invoices.paidHalalas,
        totalHalalas:    invoices.totalHalalas,
        status:          invoices.status,
        createdAt:       invoices.createdAt,
      })
      .from(invoices)
      .where(and(eq(invoices.agencyId, agencyId), gte(invoices.createdAt, startOfMonth)));

    let monthRevenue = 0;
    let monthVat     = 0;
    for (const inv of monthInvRows) {
      monthRevenue += inv.subtotalHalalas;
      monthVat     += inv.vatHalalas;
    }

    // AR outstanding (total - paid across all invoices, excluding cancelled/refunded)
    const arRows = await db
      .select({ total: invoices.totalHalalas, paid: invoices.paidHalalas })
      .from(invoices)
      .where(and(eq(invoices.agencyId, agencyId), sql`${invoices.status} NOT IN ('cancelled','refunded')`));

    const arOutstanding = arRows.reduce((s, r) => s + Math.max(0, r.total - r.paid), 0);

    // Active + pending bookings
    const bkRows = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.agencyId, agencyId));

    let activeBookings  = 0;
    let pendingBookings = 0;
    for (const bk of bkRows) {
      if (bk.status === 'confirmed') activeBookings++;
      if (bk.status === 'draft')     pendingBookings++;
    }

    return NextResponse.json({ stats: { monthRevenue, monthVat, activeBookings, pendingBookings, arOutstanding } });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
