'use client';

import { useState, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useArAging, type AgingBucket } from '@/hooks/useArAging';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, Clock, CheckCircle2, Search, X,
  ArrowUpRight, Download, TrendingDown,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

type BucketFilter = 'all' | AgingBucket;

interface BucketMeta {
  key:     BucketFilter;
  labelAr: string;
  labelEn: string;
  bg:      string;
  border:  string;
  text:    string;
  badgeBg: string;
  icon:    React.ReactNode;
}

const BUCKET_META: BucketMeta[] = [
  { key: 'current', labelAr: 'حالي (0–30 يوم)', labelEn: 'Current (0–30 days)',
    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700',
    badgeBg: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={18} /> },
  { key: '31-60',   labelAr: '31–60 يوم',       labelEn: '31–60 days',
    bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',
    badgeBg: 'bg-amber-100 text-amber-700',
    icon: <Clock size={18} /> },
  { key: '61-90',   labelAr: '61–90 يوم',       labelEn: '61–90 days',
    bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',
    badgeBg: 'bg-orange-100 text-orange-700',
    icon: <Clock size={18} /> },
  { key: '90+',     labelAr: 'أكثر من 90 يوم',  labelEn: 'Over 90 days',
    bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',
    badgeBg: 'bg-red-100 text-red-700',
    icon: <AlertTriangle size={18} /> },
];

export function ArAgingTab() {
  const locale    = useLocale();
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const { rows, summary, loading } = useArAging();
  const [bucket, setBucket]       = useState<BucketFilter>('all');
  const [search, setSearch]       = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (bucket !== 'all' && r.bucket !== bucket) return false;
      if (!q) return true;
      const name = (isAr ? r.customerNameAr : r.customerNameEn).toLowerCase();
      return (
        name.includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.bookingNumber ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, bucket, search, isAr]);

  const filteredTotal = filtered.reduce((s, r) => s + r.amountDueHalalas, 0);

  function handleExport() {
    downloadCSV([
      [isAr ? 'العميل' : 'Customer', isAr ? 'رقم الفاتورة' : 'Invoice #',
       isAr ? 'رقم الحجز' : 'Booking #', isAr ? 'تاريخ الإصدار' : 'Issue Date',
       isAr ? 'الأيام' : 'Days', isAr ? 'الإجمالي (ر.س)' : 'Grand Total (SAR)',
       isAr ? 'المدفوع (ر.س)' : 'Paid (SAR)', isAr ? 'المستحق (ر.س)' : 'Due (SAR)',
       isAr ? 'الفئة' : 'Bucket'],
      ...filtered.map(r => [
        isAr ? r.customerNameAr : r.customerNameEn,
        r.invoiceNumber, r.bookingNumber ?? '',
        formatDate(r.issueDate, fmtLocale),
        r.daysOutstanding,
        r.grandTotalHalalas / 100,
        r.amountPaidHalalas / 100,
        r.amountDueHalalas  / 100,
        r.bucket,
      ]),
    ], `ذمم-مدينة-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const bucketAmounts: Record<AgingBucket, number> = {
    'current': summary.currentHalalas,
    '31-60':   summary.days31to60Halalas,
    '61-90':   summary.days61to90Halalas,
    '90+':     summary.days90plusHalalas,
  };

  return (
    <div className="space-y-6">

      {/* Critical alert */}
      {summary.criticalCount > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-sm text-red-700">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">
              {isAr
                ? `${summary.criticalCount} فاتورة تجاوزت 90 يوماً — إجمالي ${formatCurrency(summary.days90plusHalalas, fmtLocale)}`
                : `${summary.criticalCount} invoice(s) over 90 days — total ${formatCurrency(summary.days90plusHalalas, fmtLocale)}`}
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {isAr ? 'يُنصح بالتواصل الفوري مع هؤلاء العملاء' : 'Immediate follow-up recommended for these customers'}
            </p>
          </div>
        </div>
      )}

      {/* Aging KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {BUCKET_META.map(meta => {
          const amt   = bucketAmounts[meta.key as AgingBucket] ?? 0;
          const count = rows.filter(r => r.bucket === meta.key).length;
          return (
            <button
              key={meta.key}
              onClick={() => setBucket(prev => prev === meta.key ? 'all' : meta.key as BucketFilter)}
              className={cn(
                'text-start rounded-2xl border p-4 transition-all',
                meta.bg, meta.border,
                bucket === meta.key && 'ring-2 ring-offset-1 ring-brand-400',
              )}
            >
              <div className={cn('flex items-center gap-2 mb-2', meta.text)}>
                {meta.icon}
                <span className="text-xs font-bold">{isAr ? meta.labelAr : meta.labelEn}</span>
              </div>
              <p className={cn('text-xl font-extrabold tabular-nums', meta.text)}>
                {formatCurrency(amt, fmtLocale)}
              </p>
              <p className={cn('text-xs mt-1 opacity-70', meta.text)}>
                {count} {isAr ? 'فاتورة' : 'invoice(s)'}
              </p>
            </button>
          );
        })}
      </div>

      {/* Summary bar */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              {isAr ? 'إجمالي الذمم المدينة' : 'Total Accounts Receivable'}
            </p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">
              {formatCurrency(summary.totalDueHalalas, fmtLocale)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {summary.invoiceCount} {isAr ? 'فاتورة غير مسددة' : 'outstanding invoice(s)'}
            </p>
          </div>
          {/* Visual aging bar */}
          {summary.totalDueHalalas > 0 && (
            <div className="flex-1 min-w-48">
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {(['current','31-60','61-90','90+'] as AgingBucket[]).map(b => {
                  const pct = Math.round((bucketAmounts[b] / summary.totalDueHalalas) * 100);
                  const colors: Record<AgingBucket, string> = {
                    'current': 'bg-emerald-400', '31-60': 'bg-amber-400',
                    '61-90': 'bg-orange-500', '90+': 'bg-red-600',
                  };
                  return pct > 0 ? (
                    <div key={b} className={`${colors[b]} transition-all`} style={{ width: `${pct}%` }} title={`${b}: ${pct}%`} />
                  ) : null;
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>{isAr ? 'حالي' : 'Current'}</span>
                <span>{isAr ? '+90 يوم' : '90+ days'}</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالعميل أو رقم الفاتورة...' : 'Search by customer or invoice #...'}
            className="w-full ps-9 pe-9 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBucket('all')}
            className={cn('px-3 py-2 rounded-xl text-xs font-bold transition-colors',
              bucket === 'all' ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}
          >
            {isAr ? 'الكل' : 'All'}
          </button>
          {BUCKET_META.map(m => (
            <button
              key={m.key}
              onClick={() => setBucket(prev => prev === m.key ? 'all' : m.key as BucketFilter)}
              className={cn('px-3 py-2 rounded-xl text-xs font-bold transition-colors',
                bucket === m.key ? 'bg-brand-600 text-white' : `bg-white border ${m.border} ${m.text} hover:${m.bg}`)}
            >
              {isAr ? m.labelAr.split(' ')[0] : m.labelEn.split(' ')[0]}
            </button>
          ))}
          <button onClick={handleExport}
            className="ms-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors bg-white">
            <Download size={13} />{isAr ? 'CSV' : 'CSV'}
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <TrendingDown size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">
            {rows.length === 0
              ? (isAr ? 'لا توجد ذمم مدينة — جميع الفواتير مسددة! 🎉' : 'No outstanding invoices — all paid! 🎉')
              : (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results')}
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-surface-border">
                  <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'العميل' : 'Customer'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'الفاتورة' : 'Invoice'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'الأيام' : 'Days'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'المدفوع' : 'Paid'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'المستحق' : 'Due'}
                  </th>
                  <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'إجراء' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(r => {
                  const meta   = BUCKET_META.find(m => m.key === r.bucket)!;
                  const custName = isAr ? (r.customerNameAr || r.customerNameEn) : (r.customerNameEn || r.customerNameAr);
                  return (
                    <tr key={r.invoiceId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="ps-5 pe-3 py-3.5">
                        <p className="text-sm font-semibold text-slate-900 truncate max-w-[160px]">
                          {custName || (isAr ? '(غير محدد)' : '(unknown)')}
                        </p>
                        {r.bookingNumber && (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{r.bookingNumber}</p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 hidden md:table-cell">
                        <span className="text-xs font-mono text-brand-600 font-semibold">{r.invoiceNumber}</span>
                      </td>
                      <td className="px-3 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-slate-500">{formatDate(r.issueDate, fmtLocale)}</span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className={cn('inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full', meta.badgeBg)}>
                          {r.daysOutstanding}
                          {isAr ? ' ي' : 'd'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end hidden sm:table-cell">
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatCurrency(r.grandTotalHalalas, fmtLocale)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end hidden sm:table-cell">
                        <span className="text-xs text-emerald-600 font-mono tabular-nums">
                          {r.amountPaidHalalas > 0 ? formatCurrency(r.amountPaidHalalas, fmtLocale) : <span className="text-slate-300">—</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end">
                        <span className={cn('text-sm font-bold font-mono tabular-nums', meta.text)}>
                          {formatCurrency(r.amountDueHalalas, fmtLocale)}
                        </span>
                      </td>
                      <td className="pe-5 px-3 py-3.5 text-end">
                        <Link
                          href={`/${locale}/invoices/${r.invoiceId}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-semibold"
                        >
                          {isAr ? 'عرض' : 'View'}
                          <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={6} className="ps-5 pe-3 py-3.5">
                    <span className="text-sm font-bold text-slate-700">
                      {isAr ? `الإجمالي (${filtered.length} فاتورة)` : `Total (${filtered.length} invoices)`}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-end">
                    <span className="text-sm font-black font-mono tabular-nums text-red-700">
                      {formatCurrency(filteredTotal, fmtLocale)}
                    </span>
                  </td>
                  <td className="pe-5 px-3 py-3.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
