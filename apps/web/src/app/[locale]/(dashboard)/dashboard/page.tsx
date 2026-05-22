import { getTranslations, getLocale } from 'next-intl/server';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  BookOpen,
  TrendingUp,
  Users,
  DollarSign,
  Plus,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

// Demo data — in production this comes from Firestore via server-side fetch or client hooks
const demoStats = {
  totalBookings: 248,
  pendingBookings: 12,
  totalRevenueSAR: 1_245_800, // halalas
  pendingPaymentsSAR: 187_500,
  activeCustomers: 183,
};

const demoRecentBookings = [
  { id: 'BK-001', customer: 'أحمد محمد العمري', type: 'عمرة', status: 'confirmed' as const, amount: 850000, date: new Date('2026-05-20') },
  { id: 'BK-002', customer: 'فاطمة علي الزهراني', type: 'طيران', status: 'pending_approval' as const, amount: 220000, date: new Date('2026-05-21') },
  { id: 'BK-003', customer: 'خالد إبراهيم السعد', type: 'فندق', status: 'confirmed' as const, amount: 450000, date: new Date('2026-05-21') },
  { id: 'BK-004', customer: 'منى عبدالله القحطاني', type: 'باقة', status: 'in_progress' as const, amount: 1200000, date: new Date('2026-05-22') },
  { id: 'BK-005', customer: 'سعود محمد الغامدي', type: 'تأشيرة', status: 'draft' as const, amount: 75000, date: new Date('2026-05-22') },
];

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');
  const locale = params.locale;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {locale === 'ar' ? 'آخر تحديث: الآن' : 'Last updated: just now'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/bookings/new`}>
            <Button size="sm">
              <Plus size={16} />
              {t('newBooking')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title={t('totalBookings')}
          value={demoStats.totalBookings.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')}
          icon={BookOpen}
          iconBg="bg-brand-50"
          iconColor="text-brand-600"
          trend={{ value: 12, label: locale === 'ar' ? 'هذا الشهر' : 'this month', direction: 'up' }}
        />
        <StatsCard
          title={t('pendingBookings')}
          value={demoStats.pendingBookings}
          icon={FileText}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          subtitle={locale === 'ar' ? 'تحتاج مراجعة' : 'Need review'}
        />
        <StatsCard
          title={t('totalRevenue')}
          value={formatCurrency(demoStats.totalRevenueSAR, locale === 'ar' ? 'ar-SA' : 'en-SA')}
          icon={TrendingUp}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          trend={{ value: 8, label: locale === 'ar' ? 'مقارنةً بالشهر الماضي' : 'vs last month', direction: 'up' }}
        />
        <StatsCard
          title={t('pendingPayments')}
          value={formatCurrency(demoStats.pendingPaymentsSAR, locale === 'ar' ? 'ar-SA' : 'en-SA')}
          icon={DollarSign}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          subtitle={locale === 'ar' ? 'مستحق التحصيل' : 'Due for collection'}
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent bookings */}
        <Card className="xl:col-span-2" padding="none">
          <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t('recentBookings')}</h2>
            <Link href={`/${locale}/bookings`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              {locale === 'ar' ? 'عرض الكل' : 'View all'}
            </Link>
          </div>
          <div className="divide-y divide-surface-border">
            {demoRecentBookings.map((booking) => (
              <div key={booking.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{booking.customer}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{booking.id} · {booking.type}</p>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(booking.amount, locale === 'ar' ? 'ar-SA' : 'en-SA')}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(booking.date, locale === 'ar' ? 'ar-SA' : 'en-SA')}</p>
                </div>
                <BookingStatusBadge status={booking.status} locale={locale} />
              </div>
            ))}
          </div>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('quickActions')}</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {[
              { label: t('newBooking'), href: `/${locale}/bookings/new`, icon: <BookOpen size={16} />, color: 'bg-brand-50 text-brand-700 hover:bg-brand-100' },
              { label: t('newCustomer'), href: `/${locale}/customers/new`, icon: <Users size={16} />, color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
              { label: t('createInvoice'), href: `/${locale}/invoices/new`, icon: <FileText size={16} />, color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
              { label: t('viewReports'), href: `/${locale}/reports`, icon: <TrendingUp size={16} />, color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-150 ${action.color}`}
              >
                {action.icon}
                {action.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
