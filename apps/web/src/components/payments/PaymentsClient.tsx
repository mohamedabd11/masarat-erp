'use client';

import { useState, useMemo } from 'react';
import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Receipt, Search, X, CheckCircle2, Clock, AlertCircle,
  Wallet, TrendingUp, BarChart3, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface PaymentsClientProps { locale: string }
type PaymentFilter = 'all' | 'unpaid' | 'partial' | 'fully_paid';

function PaymentStatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { ar: string; en: string; cls: string; icon: typeof AlertCircle }> = {
    unpaid:     { ar: 'غير مدفوع', en: 'Unpaid',   cls: 'bg-red-100 text-red-700',         icon: AlertCircle },
    partial:    { ar: 'دفع جزئي',  en: 'Partial',  cls: 'bg-amber-100 text-amber-700',      icon: Clock },
    fully_paid: { ar: 'مكتمل',     en: 'Paid',     cls: 'bg-emerald-100 text-emerald-700',  icon: CheckCircle2 },
    refunded:   { ar: 'مسترد',     en: 'Refunded', cls: 'bg-slate-100 text-slate-600',      icon: Receipt },
  };
  const m = map[status] ?? { ar: status, en: status, cls: 'bg-slate-100 text-slate-600', icon: Clock };
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold', m.cls)}>
      <Icon size={12} />
      {isAr ? m.ar : m.en}
    </span>
  );
}

export function PaymentsClient({ locale }: PaymentsClientProps) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const { bookings, loading, error } = useFirestoreBookings({ pageSize: 200 });
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [search, setSearch] = useState('');

  // ── Aggregates ────────────────────────────────────────────────────────────
  const totalPaid    = bookings.reduce((s, b) => s + ((b as any).paidHalalas ?? b.totalPaid ?? 0), 0);
  const totalDue     = bookings.reduce((s, b) => {
    const total = (b as any).grandTotalHalalas ?? (b as any).pricing?.totalAmount ?? 0;
    const paid  = (b as any).paidHalalas ?? b.totalPaid ?? 0;
    return s + Math.max(0, total - paid);
  }, 0);
  const collectionRate = (totalPaid + totalDue) > 0 ? Math.round((totalPaid / (totalPaid + totalDue)) * 100) : 0;

  // ── Aging buckets ─────────────────────────────────────────────────────────
  const now    = Date.now();
  const aging  = useMemo(() => {
    const current: number[] = [0, 0, 0, 0, 0]; // [current, 1-30, 31-60, 61-90, 90+]
    bookings.forEach(b => {
      const due = (b as any).grandTotalHalalas ?? (b as any).pricing?.totalAmount ?? 0;
      const paid = (b as any).paidHalalas ?? b.totalPaid ?? 0;
      const outstanding = Math.max(0, due - paid);
      if (outstanding <= 0) return;
      const created = (b as any).createdAt?.toDate?.()?.getTime() ?? now;
      const ageDays = Math.floor((now - created) / 86_400_000);
      if      (ageDays <= 0)  current[0] += outstanding;
      else if (ageDays <= 30) current[1] += outstanding;
      else if (ageDays <= 60) current[2] += outstanding;
      else if (ageDays <= 90) current[3] += outstanding;
      else                    current[4] += outstanding;
    });
    return current;
  }, [bookings, now]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings.filter(b => {
      const matchFilter = filter === 'all' || b.paymentStatus === filter;
      const name = isAr ? b.customerName.ar : b.customerName.en;
      const matchSearch = !q || name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [bookings, filter, search, isAr]);

  const FILTERS: { key: PaymentFilter; ar: string; en: string }[] = [
    { key: 'all',        ar: 'الكل',       en: 'All' },
    { key: 'unpaid',     ar: 'غير مدفوع',  en: 'Unpaid' },
    { key: 'partial',    ar: 'دفع جزئي',   en: 'Partial' },
    { key: 'fully_paid', ar: 'مكتمل',      en: 'Paid' },
  ];

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;
  if (error)   return <div className="py-8 text-center text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'المدفوعات والتحصيل' : 'Payments & Collections'}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'متابعة المدفوعات والمستحقات وتقرير التقادم' : 'Track payments, outstanding balances, and aging report'}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { icon: Wallet,     bg: 'bg-emerald-50', color: 'text-emerald-600', accent: 'border-emerald-500', label: isAr ? 'إجمالي المحصّل' : 'Total Collected',      value: formatCurrency(totalPaid,  fmtLocale) },
          { icon: AlertCircle,bg: 'bg-red-50',     color: 'text-red-600',     accent: 'border-red-500',     label: isAr ? 'إجمالي المستحق' : 'Total Outstanding',    value: formatCurrency(totalDue,   fmtLocale) },
          { icon: TrendingUp, bg: 'bg-brand-50',   color: 'text-brand-600',   accent: 'border-brand-500',   label: isAr ? 'نسبة التحصيل' : 'Collection Rate',        value: `${collectionRate}%` },
          { icon: BarChart3,  bg: 'bg-amber-50',   color: 'text-amber-600',   accent: 'border-amber-500',   label: isAr ? 'دفع جزئي' : 'Partial Payments',           value: formatCount(bookings.filter(b => b.paymentStatus === 'partial').length, fmtLocale) },
        ].map(k => (
          <div key={k.label} className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-s-4', k.accent)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{k.label}</p>
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">{k.value}</p>
              </div>
              <div className={cn('p-2.5 rounded-xl', k.bg)}>
                <k.icon size={18} className={k.color} strokeWidth={2} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Aging Report */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">{isAr ? 'تقرير تقادم الديون (Aging Report)' : 'Aging Report — Outstanding by Age'}</h2>
          <span className="text-xs text-slate-400">{isAr ? 'المبالغ المستحقة حسب عمر الدين' : 'Outstanding balances by age'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: isAr ? 'حالي' : 'Current',     labelEn: '0 days',   amount: aging[0], color: 'bg-emerald-500', textColor: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: isAr ? '1–30 يوم' : '1–30 days', labelEn: '1-30d', amount: aging[1], color: 'bg-amber-400',   textColor: 'text-amber-700',   bg: 'bg-amber-50' },
            { label: isAr ? '31–60 يوم' : '31–60d',  labelEn: '31-60d', amount: aging[2], color: 'bg-orange-500',  textColor: 'text-orange-700',  bg: 'bg-orange-50' },
            { label: isAr ? '61–90 يوم' : '61–90d',  labelEn: '61-90d', amount: aging[3], color: 'bg-red-500',     textColor: 'text-red-700',     bg: 'bg-red-50' },
            { label: isAr ? '90+ يوم' : '90+ days',  labelEn: '90+d',   amount: aging[4], color: 'bg-red-800',     textColor: 'text-red-900',     bg: 'bg-red-100' },
          ].map((bucket, i) => (
            <div key={i} className={cn('rounded-xl p-3 border border-slate-200', bucket.bg)}>
              <p className="text-[11px] font-bold text-slate-500 mb-1">{bucket.label}</p>
              <p className={cn('text-sm font-black tabular-nums', bucket.textColor)}>
                {formatCurrency(bucket.amount, fmtLocale)}
              </p>
              <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', bucket.color)}
                  style={{ width: totalDue > 0 ? `${Math.min(100, Math.round((bucket.amount / totalDue) * 100))}%` : '0%' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-1">
          {FILTERS.map(f => {
            const count = f.key === 'all' ? bookings.length : bookings.filter(b => b.paymentStatus === f.key).length;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors',
                  filter === f.key ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
                )}>
                {isAr ? f.ar : f.en}
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                  filter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث...' : 'Search...'}
            className="rounded-xl border border-slate-200 bg-white ps-9 pe-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-56" />
          {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt size={48} />}
          title={isAr ? 'لا توجد نتائج' : 'No results'}
          description={isAr ? 'جرب تغيير الفلتر' : 'Try changing the filter'} />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60">
                  <th className="text-start ps-6 pe-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رقم الحجز' : 'Booking #'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حالة الدفع' : 'Status'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'تقدم التحصيل' : 'Progress'}</th>
                  <th className="text-end px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'المدفوع' : 'Paid'}</th>
                  <th className="text-end pe-6 px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'المستحق' : 'Due'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(b => {
                  const name     = isAr ? b.customerName.ar : b.customerName.en;
                  const total    = (b as any).grandTotalHalalas ?? (b as any).pricing?.totalAmount ?? 0;
                  const paidAmt  = (b as any).paidHalalas ?? b.totalPaid ?? 0;
                  const dueAmt   = Math.max(0, total - paidAmt);
                  const pct      = total > 0 ? Math.min(100, Math.round((paidAmt / total) * 100)) : 0;
                  const createdAt = (b as any).createdAt?.toDate?.() ?? null;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="ps-6 pe-3 py-4">
                        <Link href={`/${locale}/bookings/${b.id}`}
                          className="font-mono text-sm font-semibold text-brand-700 hover:underline">
                          {b.id.slice(0, 12)}…
                        </Link>
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-sm font-semibold text-slate-900">{name}</p>
                      </td>
                      <td className="px-3 py-4 hidden sm:table-cell">
                        <span className="text-sm text-slate-500">{createdAt ? formatDate(createdAt, fmtLocale) : '—'}</span>
                      </td>
                      <td className="px-3 py-4">
                        <PaymentStatusBadge status={b.paymentStatus} isAr={isAr} />
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <div className="w-36">
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>{pct}%</span>
                            <span>{formatCurrency(paidAmt, fmtLocale)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-amber-400')}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-end">
                        <span className="text-sm font-semibold tabular-nums text-emerald-700">
                          {paidAmt > 0 ? formatCurrency(paidAmt, fmtLocale) : <span className="text-slate-300">—</span>}
                        </span>
                      </td>
                      <td className="pe-6 px-3 py-4 text-end">
                        <div className="flex items-center justify-end gap-2">
                          <span className={cn('text-sm font-bold tabular-nums', dueAmt > 0 ? 'text-red-600' : 'text-slate-300')}>
                            {dueAmt > 0 ? formatCurrency(dueAmt, fmtLocale) : '—'}
                          </span>
                          {dueAmt > 0 && (
                            <Link href={`/${locale}/bookings/${b.id}`}
                              className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <ArrowRight size={13} className="text-brand-500" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr ? `${formatCount(filtered.length, fmtLocale)} سجل` : `${filtered.length} records`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
