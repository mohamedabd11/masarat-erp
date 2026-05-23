'use client';

import { useState } from 'react';
import { useAuth } from '@masarat/firebase';
import type { BookingDoc } from '@masarat/firebase';
import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Receipt, Search, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface PaymentsClientProps {
  locale: string;
}

type PaymentFilter = 'all' | 'unpaid' | 'partial' | 'fully_paid';

function PaymentStatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { ar: string; en: string; class: string; icon: React.ReactNode }> = {
    unpaid:     { ar: 'غير مدفوع', en: 'Unpaid',     class: 'bg-red-100 text-red-700',     icon: <AlertCircle size={12} /> },
    partial:    { ar: 'جزئي',      en: 'Partial',    class: 'bg-amber-100 text-amber-700',  icon: <Clock size={12} /> },
    fully_paid: { ar: 'مكتمل',     en: 'Paid',       class: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={12} /> },
    refunded:   { ar: 'مسترد',     en: 'Refunded',   class: 'bg-slate-100 text-slate-600',  icon: <Receipt size={12} /> },
  };
  const entry = map[status] ?? { ar: status, en: status, class: 'bg-slate-100 text-slate-600', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${entry.class}`}>
      {entry.icon}
      {isAr ? entry.ar : entry.en}
    </span>
  );
}

export function PaymentsClient({ locale }: PaymentsClientProps) {
  const isAr = locale === 'ar';
  const { bookings, loading, error } = useFirestoreBookings({ pageSize: 100 });
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [search, setSearch] = useState('');

  const totalUnpaid = bookings.reduce((s, b) => s + (b.totalDue ?? 0), 0);
  const totalPaid   = bookings.reduce((s, b) => s + (b.totalPaid ?? 0), 0);
  const unpaidCount = bookings.filter(b => b.paymentStatus === 'unpaid').length;
  const partialCount = bookings.filter(b => b.paymentStatus === 'partial').length;

  const filtered = bookings.filter(b => {
    const matchFilter = filter === 'all' || b.paymentStatus === filter;
    const name = isAr ? b.customerName.ar : b.customerName.en;
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || b.id.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const FILTERS: { key: PaymentFilter; ar: string; en: string }[] = [
    { key: 'all',       ar: 'الكل',        en: 'All' },
    { key: 'unpaid',    ar: 'غير مدفوع',   en: 'Unpaid' },
    { key: 'partial',   ar: 'جزئي',        en: 'Partial' },
    { key: 'fully_paid',ar: 'مكتمل',       en: 'Paid' },
  ];

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (error) return <div className="py-8 text-center text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'المدفوعات' : 'Payments'}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'متابعة المدفوعات والمستحقات' : 'Track payments and outstanding balances'}</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Receipt,       bg: 'bg-brand-50',   color: 'text-brand-600',   label: isAr ? 'إجمالي المحصّل' : 'Total Collected',  value: formatCurrency(totalPaid, isAr ? 'ar-SA' : 'en-SA') },
          { icon: AlertCircle,   bg: 'bg-red-50',     color: 'text-red-600',     label: isAr ? 'إجمالي المستحق' : 'Total Outstanding', value: formatCurrency(totalUnpaid, isAr ? 'ar-SA' : 'en-SA') },
          { icon: Clock,         bg: 'bg-amber-50',   color: 'text-amber-600',   label: isAr ? 'دفع جزئي' : 'Partial',                value: partialCount },
          { icon: AlertCircle,   bg: 'bg-rose-50',    color: 'text-rose-600',    label: isAr ? 'غير مدفوع' : 'Unpaid',                value: unpaidCount },
        ].map(kpi => (
          <Card key={kpi.label} className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl flex-shrink-0 ${kpi.bg}`}>
              <kpi.icon size={18} className={kpi.color} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{kpi.label}</p>
              <p className="text-lg font-bold text-slate-900">{kpi.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isAr ? f.ar : f.en}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث...' : 'Search...'}
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt size={48} />}
          title={isAr ? 'لا توجد نتائج' : 'No results'}
          description={isAr ? 'جرب تغيير الفلتر أو البحث' : 'Try changing the filter or search'}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  <th className="text-start ps-6 pe-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{isAr ? 'رقم الحجز' : 'Booking #'}</th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-end px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'المدفوع' : 'Paid'}</th>
                  <th className="text-end ps-4 pe-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{isAr ? 'المستحق' : 'Due'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(booking => {
                  const name = isAr ? booking.customerName.ar : booking.customerName.en;
                  const typeLabels: Record<string, { ar: string; en: string }> = {
                    flight: { ar: 'طيران', en: 'Flight' }, hotel: { ar: 'فندق', en: 'Hotel' },
                    package: { ar: 'باقة', en: 'Package' }, umrah: { ar: 'عمرة', en: 'Umrah' },
                    insurance: { ar: 'تأمين', en: 'Insurance' }, visa: { ar: 'تأشيرة', en: 'Visa' },
                    transport: { ar: 'نقل', en: 'Transport' },
                  };
                  const typeLabel = typeLabels[booking.type];
                  return (
                    <tr key={booking.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="ps-6 pe-4 py-4">
                        <Link href={`/${locale}/bookings/${booking.id}`} className="text-sm font-mono font-medium text-brand-700 hover:underline">
                          {booking.id}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">{name}</p>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <span className="text-sm text-slate-600">
                          {typeLabel ? (isAr ? typeLabel.ar : typeLabel.en) : booking.type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <PaymentStatusBadge status={booking.paymentStatus} isAr={isAr} />
                      </td>
                      <td className="px-4 py-4 text-end hidden sm:table-cell">
                        <span className="text-sm font-medium text-emerald-700">
                          {formatCurrency(booking.totalPaid ?? 0, isAr ? 'ar-SA' : 'en-SA')}
                        </span>
                      </td>
                      <td className="ps-4 pe-6 py-4 text-end">
                        <span className={`text-sm font-semibold ${(booking.totalDue ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {(booking.totalDue ?? 0) > 0
                            ? formatCurrency(booking.totalDue!, isAr ? 'ar-SA' : 'en-SA')
                            : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr ? `${filtered.length} سجل` : `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
