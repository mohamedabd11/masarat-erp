import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export interface AppNotification {
  id:       string;
  type:     'overdue_invoice' | 'passport_expiry' | 'trial_expiry';
  severity: 'error' | 'warning' | 'info';
  titleAr:  string;
  titleEn:  string;
  descAr:   string;
  descEn:   string;
  link:     string;
}

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url    = new URL(request.url);
    const locale = url.searchParams.get('locale') ?? 'ar';

    const now      = Date.now();
    const in90days = now + 90 * 24 * 60 * 60 * 1000;
    const result: AppNotification[] = [];

    // Overdue invoices: issued/partial status where total > paid and issue_date is old (30+ days)
    const overdueInvs = await db
      .select({
        id: invoices.id, invoiceNumber: invoices.invoiceNumber,
        buyerNameAr: invoices.buyerNameAr, buyerNameEn: invoices.buyerNameEn,
        totalHalalas: invoices.totalHalalas, paidHalalas: invoices.paidHalalas,
        issueDate: invoices.issueDate,
      })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        sql`${invoices.status} IN ('issued','partial')`,
      ));

    for (const inv of overdueInvs) {
      const issued   = new Date(inv.issueDate).getTime();
      const daysOld  = Math.floor((now - issued) / 86_400_000);
      if (daysOld < 30) continue;
      const customer = inv.buyerNameAr ?? inv.buyerNameEn ?? '';
      result.push({
        id:       `overdue-${inv.id}`,
        type:     'overdue_invoice',
        severity: 'error',
        titleAr:  `فاتورة متأخرة — ${inv.invoiceNumber}`,
        titleEn:  `Overdue Invoice — ${inv.invoiceNumber}`,
        descAr:   `${customer} · متأخرة ${daysOld} ${daysOld === 1 ? 'يوم' : 'أيام'}`,
        descEn:   `${customer} · ${daysOld} day${daysOld === 1 ? '' : 's'} overdue`,
        link:     `/${locale}/invoices/${inv.id}`,
      });
    }

    // Passports expiring within 90 days (from booking details JSON)
    const activeBookings = await db
      .select({ id: bookings.id, bookingNumber: bookings.bookingNumber, details: bookings.details })
      .from(bookings)
      .where(and(
        eq(bookings.agencyId, agencyId),
        sql`${bookings.status} NOT IN ('cancelled','completed')`,
      ));

    for (const bk of activeBookings) {
      const details     = (bk.details ?? {}) as Record<string, unknown>;
      const passengers  = (details['passengers'] as unknown[]) ?? [];
      for (const p of passengers) {
        const pax    = p as Record<string, unknown>;
        const expiry = pax['passportExpiry'] as string | undefined;
        if (!expiry) continue;
        const exp = new Date(expiry).getTime();
        if (isNaN(exp) || exp > in90days) continue;
        const name      = (pax['nameAr'] as string | undefined) ?? (pax['nameEn'] as string | undefined) ?? '';
        const daysLeft  = Math.ceil((exp - now) / 86_400_000);
        const isExpired = exp < now;
        result.push({
          id:       `passport-${bk.id}-${String(pax['passportNumber'] ?? Math.random())}`,
          type:     'passport_expiry',
          severity: isExpired ? 'error' : 'warning',
          titleAr:  isExpired ? 'جواز سفر منتهي الصلاحية' : 'جواز سفر ينتهي قريباً',
          titleEn:  isExpired ? 'Passport Expired' : 'Passport Expiring Soon',
          descAr:   `${name} · حجز ${bk.bookingNumber}${isExpired ? ' (منتهي)' : ` · بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`}`,
          descEn:   `${name} · Booking ${bk.bookingNumber}${isExpired ? ' (expired)' : ` · in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
          link:     `/${locale}/bookings/${bk.id}`,
        });
      }
    }

    result.sort((a, b) => {
      if (a.severity === 'error' && b.severity !== 'error') return -1;
      if (b.severity === 'error' && a.severity !== 'error') return 1;
      return 0;
    });

    return NextResponse.json({ notifications: result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
