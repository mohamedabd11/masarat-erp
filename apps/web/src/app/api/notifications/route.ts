import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings, agencies, appointments, leaveRequests, recurringInvoices } from '@/lib/schema';
import { verifyAuth, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export interface AppNotification {
  id:       string;
  type:     'overdue_invoice' | 'passport_expiry' | 'trial_expiry' | 'upcoming_appointment' | 'leave_pending' | 'recurring_due';
  severity: 'error' | 'warning' | 'info';
  titleAr:  string;
  titleEn:  string;
  descAr:   string;
  descEn:   string;
  link:     string;
}

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    const url    = new URL(request.url);
    const locale = url.searchParams.get('locale') ?? 'ar';

    const now      = Date.now();
    const in90days = now + 90 * 24 * 60 * 60 * 1000;
    const in24h    = now + 24 * 60 * 60 * 1000;
    const in7days  = now + 7 * 24 * 60 * 60 * 1000;
    const result: AppNotification[] = [];

    const isManagerUp = ROLES_MANAGER_UP.includes(role as never);

    // 1. Overdue invoices (30+ days)
    const overdueInvs = await db
      .select({
        id: invoices.id, invoiceNumber: invoices.invoiceNumber,
        buyerNameAr: invoices.buyerNameAr, buyerNameEn: invoices.buyerNameEn,
        issueDate: invoices.issueDate,
      })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        sql`${invoices.status} IN ('issued','partial')`,
      ));

    for (const inv of overdueInvs) {
      const daysOld = Math.floor((now - new Date(inv.issueDate).getTime()) / 86_400_000);
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

    // 2. Passports expiring within 90 days
    const activeBookings = await db
      .select({ id: bookings.id, bookingNumber: bookings.bookingNumber, details: bookings.details })
      .from(bookings)
      .where(and(
        eq(bookings.agencyId, agencyId),
        sql`${bookings.status} NOT IN ('cancelled','completed')`,
      ));

    for (const bk of activeBookings) {
      const details    = (bk.details ?? {}) as Record<string, unknown>;
      const passengers = (details['passengers'] as unknown[]) ?? [];
      for (const p of passengers) {
        const pax    = p as Record<string, unknown>;
        const expiry = pax['passportExpiry'] as string | undefined;
        if (!expiry) continue;
        const exp = new Date(expiry).getTime();
        if (isNaN(exp) || exp > in90days) continue;
        const name     = (pax['nameAr'] as string | undefined) ?? (pax['nameEn'] as string | undefined) ?? '';
        const daysLeft = Math.ceil((exp - now) / 86_400_000);
        const expired  = exp < now;
        result.push({
          id:       `passport-${bk.id}-${String(pax['passportNumber'] ?? Math.random())}`,
          type:     'passport_expiry',
          severity: expired ? 'error' : 'warning',
          titleAr:  expired ? 'جواز سفر منتهي الصلاحية' : 'جواز سفر ينتهي قريباً',
          titleEn:  expired ? 'Passport Expired' : 'Passport Expiring Soon',
          descAr:   `${name} · حجز ${bk.bookingNumber}${expired ? ' (منتهي)' : ` · بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`}`,
          descEn:   `${name} · Booking ${bk.bookingNumber}${expired ? ' (expired)' : ` · in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
          link:     `/${locale}/bookings/${bk.id}`,
        });
      }
    }

    // 3. Trial expiry (within 7 days)
    const [agency] = await db.select({ trialEndDate: agencies.trialEndDate, plan: agencies.plan })
      .from(agencies).where(eq(agencies.id, agencyId));
    if (agency?.plan === 'trial' && agency.trialEndDate) {
      const trialEnd  = agency.trialEndDate.getTime();
      const daysLeft  = Math.ceil((trialEnd - now) / 86_400_000);
      if (trialEnd > now && trialEnd <= in7days) {
        result.push({
          id:       `trial-expiry`,
          type:     'trial_expiry',
          severity: daysLeft <= 2 ? 'error' : 'warning',
          titleAr:  'تنبيه: انتهاء فترة التجربة',
          titleEn:  'Trial Expiring Soon',
          descAr:   `تنتهي فترة التجربة خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`,
          descEn:   `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          link:     `/${locale}/settings`,
        });
      } else if (trialEnd <= now) {
        result.push({
          id:       `trial-expired`,
          type:     'trial_expiry',
          severity: 'error',
          titleAr:  'انتهت فترة التجربة',
          titleEn:  'Trial Expired',
          descAr:   'انتهت فترة التجربة، يرجى الترقية للاستمرار',
          descEn:   'Your trial has ended. Please upgrade to continue.',
          link:     `/${locale}/settings`,
        });
      }
    }

    // 4. Upcoming appointments (next 24h)
    const upcomingAppts = await db
      .select({ id: appointments.id, title: appointments.title, scheduledAt: appointments.scheduledAt, customerName: appointments.customerName })
      .from(appointments)
      .where(and(
        eq(appointments.agencyId, agencyId),
        eq(appointments.status, 'scheduled'),
        sql`${appointments.scheduledAt} >= now()`,
        sql`${appointments.scheduledAt} <= ${new Date(in24h).toISOString()}`,
      ));

    for (const appt of upcomingAppts) {
      const hoursLeft = Math.ceil((new Date(appt.scheduledAt!).getTime() - now) / 3_600_000);
      result.push({
        id:       `appt-${appt.id}`,
        type:     'upcoming_appointment',
        severity: 'info',
        titleAr:  `موعد قادم — ${appt.title}`,
        titleEn:  `Upcoming Appointment — ${appt.title}`,
        descAr:   `${appt.customerName ?? ''} · خلال ${hoursLeft} ${hoursLeft === 1 ? 'ساعة' : 'ساعات'}`,
        descEn:   `${appt.customerName ?? ''} · in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`,
        link:     `/${locale}/appointments/${appt.id}`,
      });
    }

    // 5. Pending leave requests (managers+ only)
    if (isManagerUp) {
      const pendingLeaves = await db
        .select({ id: leaveRequests.id, employeeId: leaveRequests.employeeId, startDate: leaveRequests.startDate, type: leaveRequests.type })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.agencyId, agencyId),
          eq(leaveRequests.status, 'pending'),
        ));

      if (pendingLeaves.length > 0) {
        result.push({
          id:       `leave-pending`,
          type:     'leave_pending',
          severity: 'warning',
          titleAr:  `طلبات إجازة بانتظار الموافقة (${pendingLeaves.length})`,
          titleEn:  `Leave Requests Pending (${pendingLeaves.length})`,
          descAr:   'يوجد طلبات إجازة تنتظر مراجعتك',
          descEn:   'Leave requests are waiting for your review',
          link:     `/${locale}/employees/leave`,
        });
      }
    }

    // 6. Recurring invoices due today or overdue
    const today = new Date().toISOString().split('T')[0]!;
    const dueRecurring = await db
      .select({ id: recurringInvoices.id, title: recurringInvoices.title, nextIssueAt: recurringInvoices.nextIssueAt })
      .from(recurringInvoices)
      .where(and(
        eq(recurringInvoices.agencyId, agencyId),
        eq(recurringInvoices.isActive, true),
        sql`${recurringInvoices.nextIssueAt} <= ${today}`,
      ));

    for (const rec of dueRecurring) {
      result.push({
        id:       `recurring-${rec.id}`,
        type:     'recurring_due',
        severity: 'warning',
        titleAr:  `فاتورة دورية مستحقة — ${rec.title}`,
        titleEn:  `Recurring Invoice Due — ${rec.title}`,
        descAr:   `موعد إصدار الفاتورة الدورية: ${rec.nextIssueAt}`,
        descEn:   `Recurring invoice due: ${rec.nextIssueAt}`,
        link:     `/${locale}/recurring-invoices/${rec.id}`,
      });
    }

    result.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

    return NextResponse.json({ notifications: result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
