import { getTranslations } from 'next-intl/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, BarChart3, PieChart, Download } from 'lucide-react';

interface MonthData { month: string; monthEn: string; bookings: number; revenueHalalas: number; vatHalalas: number }

const MONTHLY_DATA: MonthData[] = [
  { month: 'يناير', monthEn: 'Jan', bookings: 28, revenueHalalas: 3_450_000, vatHalalas: 517_500 },
  { month: 'فبراير', monthEn: 'Feb', bookings: 32, revenueHalalas: 4_120_000, vatHalalas: 618_000 },
  { month: 'مارس',   monthEn: 'Mar', bookings: 41, revenueHalalas: 5_890_000, vatHalalas: 883_500 },
  { month: 'أبريل', monthEn: 'Apr', bookings: 38, revenueHalalas: 5_200_000, vatHalalas: 780_000 },
  { month: 'مايو',  monthEn: 'May', bookings: 45, revenueHalalas: 6_340_000, vatHalalas: 951_000 },
];

const TYPE_BREAKDOWN = [
  { typeAr: 'عمرة',         typeEn: 'Umrah',        count: 62, percent: 34, color: 'bg-brand-500' },
  { typeAr: 'طيران',        typeEn: 'Flights',      count: 48, percent: 26, color: 'bg-emerald-500' },
  { typeAr: 'فنادق',        typeEn: 'Hotels',       count: 35, percent: 19, color: 'bg-amber-500' },
  { typeAr: 'باقات سياحية', typeEn: 'Packages',    count: 24, percent: 13, color: 'bg-sky-500' },
  { typeAr: 'أخرى',         typeEn: 'Other',        count: 15, percent: 8,  color: 'bg-slate-400' },
];

export default async function ReportsPage({ params }: { params: { locale: string } }) {
  const locale = params.locale;
  const isAr = locale === 'ar';

  const totalRevenue = MONTHLY_DATA.reduce((s, m) => s + m.revenueHalalas, 0);
  const totalVat = MONTHLY_DATA.reduce((s, m) => s + m.vatHalalas, 0);
  const totalBookings = MONTHLY_DATA.reduce((s, m) => s + m.bookings, 0);
  const maxRevenue = Math.max(...MONTHLY_DATA.map(m => m.revenueHalalas));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التقارير' : 'Reports'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'يناير — مايو 2026' : 'January — May 2026'}
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white">
          <Download size={15} />
          {isAr ? 'تصدير PDF' : 'Export PDF'}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: TrendingUp, bg: 'bg-brand-50', color: 'text-brand-600',
            label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',
            value: formatCurrency(totalRevenue, isAr ? 'ar-SA' : 'en-SA'),
            trend: '+23%', up: true,
          },
          {
            icon: BarChart3, bg: 'bg-emerald-50', color: 'text-emerald-600',
            label: isAr ? 'إجمالي الحجوزات' : 'Total Bookings',
            value: totalBookings,
            trend: '+18%', up: true,
          },
          {
            icon: PieChart, bg: 'bg-purple-50', color: 'text-purple-600',
            label: isAr ? 'ضريبة القيمة المضافة' : 'Total VAT',
            value: formatCurrency(totalVat, isAr ? 'ar-SA' : 'en-SA'),
            trend: '+23%', up: true,
          },
        ].map(kpi => (
          <Card key={kpi.label} className="flex items-center gap-4">
            <div className={`p-3 rounded-xl flex-shrink-0 ${kpi.bg}`}>
              <kpi.icon size={20} className={kpi.color} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 mb-0.5">{kpi.label}</p>
              <p className="text-xl font-bold text-slate-900">{kpi.value}</p>
              <p className={`text-xs font-medium ${kpi.up ? 'text-emerald-600' : 'text-red-600'}`}>
                {kpi.up ? '↑' : '↓'} {kpi.trend} {isAr ? 'مقارنةً بالعام الماضي' : 'vs last year'}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly revenue bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'الإيرادات الشهرية' : 'Monthly Revenue'}</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {MONTHLY_DATA.map(month => {
              const widthPct = Math.round((month.revenueHalalas / maxRevenue) * 100);
              return (
                <div key={month.month} className="flex items-center gap-3">
                  <span className="w-10 text-xs text-slate-500 flex-shrink-0 text-end">
                    {isAr ? month.month : month.monthEn}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full flex items-center justify-end pe-2 transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    >
                      <span className="text-xs font-medium text-white">
                        {month.bookings}
                      </span>
                    </div>
                  </div>
                  <span className="w-28 text-xs font-semibold text-slate-700 flex-shrink-0">
                    {formatCurrency(month.revenueHalalas, isAr ? 'ar-SA' : 'en-SA')}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Booking type breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'توزيع أنواع الحجوزات' : 'Booking Type Breakdown'}</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {TYPE_BREAKDOWN.map(type => (
              <div key={type.typeEn}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-medium text-slate-700">{isAr ? type.typeAr : type.typeEn}</span>
                  <span className="text-slate-500">
                    {type.count} {isAr ? 'حجز' : 'bookings'} ({type.percent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${type.color} transition-all duration-500`}
                    style={{ width: `${type.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="mt-5 pt-5 border-t border-surface-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="text-start pb-2">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="text-end pb-2">{isAr ? 'الحجوزات' : 'Bookings'}</th>
                  <th className="text-end pb-2">{isAr ? 'الحصة' : 'Share'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {TYPE_BREAKDOWN.map(type => (
                  <tr key={type.typeEn}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${type.color}`} />
                        {isAr ? type.typeAr : type.typeEn}
                      </div>
                    </td>
                    <td className="py-2 text-end font-medium text-slate-900">{type.count}</td>
                    <td className="py-2 text-end text-slate-500">{type.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Monthly summary table */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{isAr ? 'التقرير الشهري التفصيلي' : 'Detailed Monthly Report'}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  {[
                    { label: isAr ? 'الشهر' : 'Month', align: 'start ps-4' },
                    { label: isAr ? 'الحجوزات' : 'Bookings', align: 'end' },
                    { label: isAr ? 'الإيرادات (قبل VAT)' : 'Revenue (excl. VAT)', align: 'end' },
                    { label: isAr ? 'ضريبة القيمة المضافة' : 'VAT', align: 'end' },
                    { label: isAr ? 'الإجمالي شامل VAT' : 'Total incl. VAT', align: 'end pe-4' },
                  ].map((col, i) => (
                    <th key={i} className={`text-${col.align} py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {MONTHLY_DATA.map(month => (
                  <tr key={month.month} className="hover:bg-slate-50/50">
                    <td className="ps-4 py-3.5 font-medium text-slate-900">
                      {isAr ? month.month : month.monthEn}
                    </td>
                    <td className="py-3.5 text-end text-slate-700">{month.bookings}</td>
                    <td className="py-3.5 text-end text-slate-700">
                      {formatCurrency(month.revenueHalalas - month.vatHalalas, isAr ? 'ar-SA' : 'en-SA')}
                    </td>
                    <td className="py-3.5 text-end text-slate-700">
                      {formatCurrency(month.vatHalalas, isAr ? 'ar-SA' : 'en-SA')}
                    </td>
                    <td className="pe-4 py-3.5 text-end font-semibold text-slate-900">
                      {formatCurrency(month.revenueHalalas, isAr ? 'ar-SA' : 'en-SA')}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="ps-4 py-3.5 font-bold text-slate-900">{isAr ? 'الإجمالي' : 'Total'}</td>
                  <td className="py-3.5 text-end font-bold text-slate-900">{totalBookings}</td>
                  <td className="py-3.5 text-end font-bold text-slate-900">
                    {formatCurrency(totalRevenue - totalVat, isAr ? 'ar-SA' : 'en-SA')}
                  </td>
                  <td className="py-3.5 text-end font-bold text-slate-900">
                    {formatCurrency(totalVat, isAr ? 'ar-SA' : 'en-SA')}
                  </td>
                  <td className="pe-4 py-3.5 text-end font-bold text-brand-700">
                    {formatCurrency(totalRevenue, isAr ? 'ar-SA' : 'en-SA')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
