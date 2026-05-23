import { getTranslations } from 'next-intl/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { DashboardRecentBookings } from '@/components/dashboard/DashboardRecentBookings';
import {
  BookOpen,
  TrendingUp,
  Users,
  Plus,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('dashboard');
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

      {/* Stats grid — real-time from Firestore */}
      <DashboardStats locale={locale} />

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
          <DashboardRecentBookings locale={locale} />
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
