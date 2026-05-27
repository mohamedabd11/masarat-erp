export const dynamic = 'force-dynamic';
import { getTranslations } from 'next-intl/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { DashboardRecentBookings } from '@/components/dashboard/DashboardRecentBookings';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { OnboardingBanner } from '@/components/dashboard/OnboardingBanner';
import {
  Plane, Building2, Moon, Stamp, Shield, Package,
  Car, Anchor, Layers, Users, TrendingUp, FileText,
  Plus,
} from 'lucide-react';
import Link from 'next/link';

const QUICK_SERVICES = [
  { type: 'flight',       ar: 'حجز طيران',    en: 'Flight',        icon: Plane,     color: '#3b82f6', bg: '#eff6ff' },
  { type: 'hotel',        ar: 'حجز فندق',     en: 'Hotel',         icon: Building2, color: '#8b5cf6', bg: '#f5f3ff' },
  { type: 'umrah',        ar: 'عمرة',         en: 'Umrah',         icon: Moon,      color: '#f59e0b', bg: '#fffbeb' },
  { type: 'visa',         ar: 'تأشيرة',       en: 'Visa',          icon: Stamp,     color: '#ef4444', bg: '#fef2f2' },
  { type: 'package',      ar: 'باقة سياحية',  en: 'Tour Package',  icon: Package,   color: '#10b981', bg: '#ecfdf5' },
  { type: 'family_visit', ar: 'زيارة عائلية', en: 'Family Visit',  icon: Users,     color: '#ec4899', bg: '#fdf2f8' },
  { type: 'insurance',    ar: 'تأمين سفر',    en: 'Insurance',     icon: Shield,    color: '#06b6d4', bg: '#ecfeff' },
  { type: 'transfer',     ar: 'نقل',          en: 'Transfer',      icon: Car,       color: '#84cc16', bg: '#f7fee7' },
];

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const t      = await getTranslations('dashboard');
  const locale = params.locale;
  const isAr   = locale === 'ar';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'لوحة التحكم' : 'Dashboard'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? new Date().toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          href={`/${locale}/bookings/new`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          {isAr ? 'تقديم خدمة جديدة' : 'New Service'}
        </Link>
      </div>

      {/* Onboarding banner — shown only when agency profile is incomplete */}
      <OnboardingBanner />

      {/* KPI Stats */}
      <DashboardStats locale={locale} />

      {/* Charts */}
      <DashboardCharts locale={locale} />

      {/* Quick Service Launch */}
      <Card>
        <CardHeader>
          <CardTitle>{isAr ? 'تقديم خدمة' : 'New Service'}</CardTitle>
          <Link
            href={`/${locale}/bookings/new`}
            className="text-xs text-slate-400 hover:text-brand-600 transition-colors"
          >
            {isAr ? 'عرض الكل' : 'All services'}
          </Link>
        </CardHeader>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {QUICK_SERVICES.map(svc => {
            const Icon = svc.icon;
            return (
              <Link
                key={svc.type}
                href={`/${locale}/bookings/new?type=${svc.type}`}
                className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-slate-50 hover:shadow-sm transition-all duration-200"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:shadow-md"
                  style={{ backgroundColor: svc.bg, color: svc.color }}
                >
                  <Icon size={22} />
                </div>
                <span className="text-[11px] font-semibold text-slate-600 text-center leading-tight group-hover:text-slate-800 transition-colors">
                  {isAr ? svc.ar : svc.en}
                </span>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent bookings */}
        <Card className="xl:col-span-2" padding="none">
          <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t('recentBookings')}</h2>
            <Link href={`/${locale}/bookings`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              {isAr ? 'عرض الكل' : 'View all'}
            </Link>
          </div>
          <DashboardRecentBookings locale={locale} />
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('quickActions')}</CardTitle>
          </CardHeader>
          <div className="space-y-2.5">
            {[
              {
                label: isAr ? 'عميل جديد'    : 'New Customer',
                href:  `/${locale}/customers/new`,
                icon:  <Users size={16} />,
                color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
              },
              {
                label: isAr ? 'إصدار فاتورة' : 'Create Invoice',
                href:  `/${locale}/invoices`,
                icon:  <FileText size={16} />,
                color: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
              },
              {
                label: isAr ? 'التقارير'     : 'View Reports',
                href:  `/${locale}/reports`,
                icon:  <TrendingUp size={16} />,
                color: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
              },
              {
                label: isAr ? 'خدمة مخصصة'  : 'Custom Service',
                href:  `/${locale}/settings?tab=service_types`,
                icon:  <Layers size={16} />,
                color: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              },
            ].map(action => (
              <Link
                key={action.href}
                href={action.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${action.color}`}
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
