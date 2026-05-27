'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BookOpen, Search, X, Plus, TrendingUp, CheckCircle2,
  Clock, AlertCircle, ChevronRight, Wallet, ArrowUpRight,
  FileText, FileX, FileCheck,
} from 'lucide-react';
import type { BookingType } from '@masarat/firebase';

// ─── Invoice status badge ─────────────────────────────────────────────────────

function InvoiceBadge({
  hasInvoice, paymentStatus, isAr,
}: { hasInvoice: boolean; paymentStatus: string; isAr: boolean }) {
  if (!hasInvoice) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">
      <FileX size={10} />
      {isAr ? 'بدون فاتورة' : 'No invoice'}
    </span>
  );
  if (paymentStatus === 'fully_paid') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
      <FileCheck size={10} />
      {isAr ? 'مدفوع' : 'Paid'}
    </span>
  );
  if (paymentStatus === 'partial') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
      <FileText size={10} />
      {isAr ? 'جزئي' : 'Partial'}
    </span>
  );
  if (paymentStatus === 'refunded') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700">
      <FileText size={10} />
      {isAr ? 'مُسترد' : 'Refunded'}
    </span>
  );
  // unpaid
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-50 text-red-600">
      <FileText size={10} />
      {isAr ? 'غير مدفوع' : 'Unpaid'}
    </span>
  );
}

interface BookingsClientProps {
  locale: string;
  bookingType?: BookingType;
  initialQuery?: string;
}

type StatusFilter = 'all' | 'pending_approval' | 'confirmed' | 'ticketed' | 'completed' | 'cancelled';

const TYPE_META: Record<string, { ar: string; en: string; bg: string; text: string }> = {
  flight:       { ar: 'طيران',        en: 'Flight',        bg: 'bg-sky-100',     text: 'text-sky-700' },
  hotel:        { ar: 'فندق',         en: 'Hotel',         bg: 'bg-amber-100',   text: 'text-amber-700' },
  package:      { ar: 'باقة سياحية',  en: 'Package',       bg: 'bg-purple-100',  text: 'text-purple-700' },
  umrah:        { ar: 'عمرة',         en: 'Umrah',         bg: 'bg-brand-100',   text: 'text-brand-700' },
  hajj:         { ar: 'حج',           en: 'Hajj',          bg: 'bg-brand-100',   text: 'text-brand-700' },
  visa:         { ar: 'تأشيرة',       en: 'Visa',          bg: 'bg-red-100',     text: 'text-red-700' },
  insurance:    { ar: 'تأمين',        en: 'Insurance',     bg: 'bg-rose-100',    text: 'text-rose-700' },
  transfer:     { ar: 'نقل',          en: 'Transfer',      bg: 'bg-emerald-100', text: 'text-emerald-700' },
  family_visit: { ar: 'زيارة عائلية', en: 'Family Visit',  bg: 'bg-pink-100',    text: 'text-pink-700' },
  cruise:       { ar: 'رحلة بحرية',   en: 'Cruise',        bg: 'bg-teal-100',    text: 'text-teal-700' },
};

const STATUS_TABS: { id: StatusFilter; ar: string; en: string }[] = [
  { id: 'all',              ar: 'الكل',           en: 'All' },
  { id: 'pending_approval', ar: 'انتظار موافقة',  en: 'Pending' },
  { id: 'confirmed',        ar: 'مؤكد',           en: 'Confirmed' },
  { id: 'ticketed',         ar: 'صدرت التذاكر',   en: 'Ticketed' },
  { id: 'completed',        ar: 'مكتمل',          en: 'Completed' },
  { id: 'cancelled',        ar: 'ملغي',           en: 'Cancelled' },
];

export function BookingsClient({ locale, bookingType, initialQuery = '' }: BookingsClientProps) {
  const { bookings, loading, error, hasMore, loadNextPage, loadingMore } =
    useFirestoreBookings({ pageSize: 50, type: bookingType });

  const [search, setSearch]             = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const revenue   = bookings.reduce((s, b) => s + (b.grandTotalHalalas ?? b.pricing?.totalAmount ?? 0), 0);
  const paid      = bookings.reduce((s, b) => s + (b.paidHalalas ?? b.totalPaid ?? 0), 0);
  const pending   = bookings.filter(b => b.status === 'pending_approval').length;
  const active    = bookings.filter(b => b.status === 'confirmed' || b.status === 'ticketed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings.filter(b => {
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const name = isAr ? (b.customerName?.ar ?? '') : (b.customerName?.en ?? '');
      const matchSearch = !q ||
        name.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        (b.bookingNumber ?? '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [bookings, search, statusFilter, isAr]);

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;
  if (error)   return <div className="py-8 text-center text-sm text-red-600">{isAr ? 'خطأ في تحميل البيانات' : 'Error loading data'}: {error}</div>;

  return (
    <div className="space-y-5">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { icon: TrendingUp,   bg: 'bg-brand-50',   color: 'text-brand-600',   accent: 'border-brand-500',   label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',   value: formatCurrency(revenue, fmtLocale) },
          { icon: Wallet,       bg: 'bg-emerald-50', color: 'text-emerald-600', accent: 'border-emerald-500', label: isAr ? 'المحصّل' : 'Collected',                value: formatCurrency(paid, fmtLocale) },
          { icon: Clock,        bg: 'bg-amber-50',   color: 'text-amber-600',   accent: 'border-amber-500',   label: isAr ? 'انتظار موافقة' : 'Pending Approval',   value: formatCount(pending, fmtLocale) },
          { icon: CheckCircle2, bg: 'bg-sky-50',     color: 'text-sky-600',     accent: 'border-sky-500',     label: isAr ? 'نشط' : 'Active',                       value: formatCount(active, fmtLocale) },
          { icon: BookOpen,     bg: 'bg-slate-50',   color: 'text-slate-600',   accent: 'border-slate-400',   label: isAr ? 'مكتملة' : 'Completed',                 value: formatCount(completed, fmtLocale) },
        ].map(k => (
          <div key={k.label} className={cn(
            'bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-s-4', k.accent,
          )}>
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

      {/* ── Search + New booking ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث بالاسم أو رقم الحجز...' : 'Search by name or booking #...'}
            className="w-full rounded-xl border border-slate-200 bg-white ps-9 pe-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <Link
          href={`/${locale}/bookings/new`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} />
          {isAr ? 'خدمة جديدة' : 'New Booking'}
        </Link>
      </div>

      {/* ── Status filter tabs ────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto pb-px">
        {STATUS_TABS.map(tab => {
          const count = tab.id === 'all' ? bookings.length : bookings.filter(b => b.status === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                statusFilter === tab.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {isAr ? tab.ar : tab.en}
              <span className={cn(
                'text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title={isAr ? 'لا توجد نتائج' : 'No results'}
          description={isAr ? 'جرب تغيير الفلتر أو البحث' : 'Try adjusting your search or filters'}
        />
      ) : (
        <Card padding="none">

          {/* ── Mobile cards (< sm) ───────────────────────────────────────── */}
          <div className="sm:hidden divide-y divide-surface-border">
            {filtered.map(b => {
              const name      = isAr ? (b.customerName?.ar ?? b.customerName?.en ?? '') : (b.customerName?.en ?? b.customerName?.ar ?? '');
              const typeMeta  = TYPE_META[b.type] ?? { ar: b.type, en: b.type, bg: 'bg-slate-100', text: 'text-slate-600' };
              const total     = b.grandTotalHalalas ?? b.pricing?.totalAmount ?? 0;
              const paidAmt   = b.paidHalalas ?? b.totalPaid ?? 0;
              const paidPct   = total > 0 ? Math.min(100, Math.round((paidAmt / total) * 100)) : 0;
              const createdAt = b.createdAt?.toDate?.() ?? null;
              const hasInvoice = (b.invoiceIds?.length ?? 0) > 0;

              return (
                <Link key={b.id} href={`/${locale}/bookings/${b.id}`}
                  className="flex flex-col gap-2 px-4 py-3.5 hover:bg-slate-50 transition-colors active:bg-slate-100">
                  {/* Row 1: number + type + invoice badge + status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="font-mono text-xs font-bold text-brand-700">
                        {b.bookingNumber ?? b.id.slice(0, 10)}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-bold', typeMeta.bg, typeMeta.text)}>
                        {isAr ? typeMeta.ar : typeMeta.en}
                      </span>
                      <InvoiceBadge hasInvoice={hasInvoice} paymentStatus={b.paymentStatus ?? 'unpaid'} isAr={isAr} />
                    </div>
                    <BookingStatusBadge status={b.status} locale={locale} />
                  </div>
                  {/* Row 2: customer name */}
                  <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                  {/* Row 3: date + payment bar + total */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">
                      {createdAt ? formatDate(createdAt, fmtLocale) : '—'}
                    </span>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      {total > 0 && (
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', paidPct === 100 ? 'bg-emerald-500' : 'bg-amber-400')}
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                      )}
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {total > 0 ? formatCurrency(total, fmtLocale) : '—'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ── Desktop table (sm+) ───────────────────────────────────────── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60">
                  <th className="text-start ps-6 pe-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رقم الحجز' : 'Booking #'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'الخدمة' : 'Service'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'الفاتورة' : 'Invoice'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell">{isAr ? 'الدفع' : 'Payment'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-end pe-5 px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(b => {
                  const name       = isAr ? (b.customerName?.ar ?? b.customerName?.en ?? '') : (b.customerName?.en ?? b.customerName?.ar ?? '');
                  const typeMeta   = TYPE_META[b.type] ?? { ar: b.type, en: b.type, bg: 'bg-slate-100', text: 'text-slate-600' };
                  const total      = b.grandTotalHalalas ?? b.pricing?.totalAmount ?? 0;
                  const paidAmt    = b.paidHalalas ?? b.totalPaid ?? 0;
                  const paidPct    = total > 0 ? Math.min(100, Math.round((paidAmt / total) * 100)) : 0;
                  const createdAt  = b.createdAt?.toDate?.() ?? null;
                  const hasInvoice = (b.invoiceIds?.length ?? 0) > 0;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="ps-6 pe-3 py-4">
                        <Link href={`/${locale}/bookings/${b.id}`} className="font-mono text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline">
                          {b.bookingNumber ?? b.id.slice(0, 12) + '…'}
                        </Link>
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-sm font-semibold text-slate-900">{name}</p>
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold', typeMeta.bg, typeMeta.text)}>
                          {isAr ? typeMeta.ar : typeMeta.en}
                        </span>
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <InvoiceBadge hasInvoice={hasInvoice} paymentStatus={b.paymentStatus ?? 'unpaid'} isAr={isAr} />
                      </td>
                      <td className="px-3 py-4 hidden lg:table-cell">
                        <span className="text-sm text-slate-500">{createdAt ? formatDate(createdAt, fmtLocale) : '—'}</span>
                      </td>
                      <td className="px-3 py-4 hidden xl:table-cell">
                        <div className="w-32">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">{paidPct}%</span>
                            <span className="text-[10px] text-slate-400">
                              {paidPct === 100 ? (isAr ? 'مكتمل' : 'Paid') : (isAr ? 'جزئي' : 'Partial')}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', paidPct === 100 ? 'bg-emerald-500' : 'bg-amber-400')}
                              style={{ width: `${paidPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <BookingStatusBadge status={b.status} locale={locale} />
                      </td>
                      <td className="pe-5 px-3 py-4 text-end">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {total > 0 ? formatCurrency(total, fmtLocale) : '—'}
                        </span>
                        <Link href={`/${locale}/bookings/${b.id}`} className="ms-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex">
                          <ChevronRight size={14} className="text-brand-500" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-surface-border flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {isAr
                ? `${formatCount(filtered.length, fmtLocale)} من ${formatCount(bookings.length, fmtLocale)} حجز`
                : `${filtered.length} of ${bookings.length} bookings`}
            </span>
            {hasMore && (
              <button onClick={loadNextPage} disabled={loadingMore}
                className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50">
                {loadingMore ? <Spinner size="sm" /> : <ArrowUpRight size={13} />}
                {isAr ? 'تحميل المزيد' : 'Load more'}
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
