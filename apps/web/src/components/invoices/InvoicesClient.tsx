'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import type { Invoice } from '@/lib/schema';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  FileText, Search, X, Download, Printer, TrendingUp,
  CheckCircle2, Clock, AlertCircle, AlertTriangle, ChevronRight,
} from 'lucide-react';

type StatusFilter = 'all' | 'issued' | 'partial' | 'paid' | 'overdue';
interface InvoicesClientProps { locale: string }

export function InvoicesClient({ locale }: InvoicesClientProps) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<StatusFilter>('all');

  useEffect(() => {
    if (!user?.agencyId) { setLoading(false); return; }
    let cancelled = false;
    apiFetch<{ invoices: Invoice[] }>('/api/invoices')
      .then(d => { if (!cancelled) { setInvoices(d.invoices); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.agencyId]);

  const now = Date.now();

  function isOverdue(inv: Invoice) {
    if (inv.status === 'paid') return false;
    if (!inv.issueDate) return false;
    const issued = new Date(inv.issueDate).getTime();
    return (now - issued) > 30 * 86_400_000;
  }

  const totalRevenue  = invoices.reduce((s, i) => s + i.totalHalalas, 0);
  const totalPaid     = invoices.reduce((s, i) => s + i.paidHalalas, 0);
  const totalDue      = invoices.reduce((s, i) => s + Math.max(0, i.totalHalalas - i.paidHalalas), 0);
  const overdueCount  = invoices.filter(isOverdue).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      const name = isAr ? (inv.buyerNameAr ?? '') : (inv.buyerNameEn ?? inv.buyerNameAr ?? '');
      const matchSearch = !q || inv.invoiceNumber.toLowerCase().includes(q) || name.toLowerCase().includes(q);
      let matchFilter = true;
      if      (filter === 'overdue') matchFilter = isOverdue(inv);
      else if (filter !== 'all')     matchFilter = inv.status === filter;
      return matchSearch && matchFilter;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, search, filter, isAr, now]);

  const STATUS_TABS: { key: StatusFilter; ar: string; en: string }[] = [
    { key: 'all',     ar: 'الكل',      en: 'All' },
    { key: 'issued',  ar: 'غير مدفوع', en: 'Unpaid' },
    { key: 'partial', ar: 'دفع جزئي',  en: 'Partial' },
    { key: 'paid',    ar: 'مدفوع',     en: 'Paid' },
    { key: 'overdue', ar: 'متأخر',     en: 'Overdue' },
  ];

  function handleExport() {
    const header = ['رقم الفاتورة', 'العميل', 'التاريخ', 'الإجمالي (ريال)', 'المدفوع (ريال)', 'المتبقي (ريال)', 'الحالة'];
    const rows = filtered.map(inv => [
      inv.invoiceNumber,
      isAr ? (inv.buyerNameAr ?? '') : (inv.buyerNameEn ?? inv.buyerNameAr ?? ''),
      inv.issueDate,
      (inv.totalHalalas / 100).toFixed(2),
      (inv.paidHalalas / 100).toFixed(2),
      ((inv.totalHalalas - inv.paidHalalas) / 100).toFixed(2),
      inv.status,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الفواتير' : 'Invoices'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'إدارة فواتير العملاء وتتبع المدفوعات' : 'Manage customer invoices and track payments'}</p>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
          <Download size={14} />
          {isAr ? 'تصدير CSV' : 'Export CSV'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp,    bg: 'bg-brand-50',   color: 'text-brand-600',   accent: 'border-brand-500',   label: isAr ? 'إجمالي الفواتير' : 'Total Invoiced',   value: formatCurrency(totalRevenue, fmtLocale) },
          { icon: CheckCircle2,  bg: 'bg-emerald-50', color: 'text-emerald-600', accent: 'border-emerald-500', label: isAr ? 'إجمالي المحصّل' : 'Total Collected',   value: formatCurrency(totalPaid, fmtLocale) },
          { icon: Clock,         bg: 'bg-amber-50',   color: 'text-amber-600',   accent: 'border-amber-500',   label: isAr ? 'مستحق التحصيل' : 'Outstanding',        value: formatCurrency(totalDue, fmtLocale) },
          { icon: AlertTriangle, bg: 'bg-red-50',     color: 'text-red-600',     accent: 'border-red-500',     label: isAr ? 'متأخرة السداد' : 'Overdue',            value: formatCount(overdueCount, fmtLocale) },
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto pb-px flex-1">
          {STATUS_TABS.map(tab => {
            let count = 0;
            if      (tab.key === 'all')     count = invoices.length;
            else if (tab.key === 'overdue') count = overdueCount;
            else                            count = invoices.filter(i => i.status === tab.key).length;
            return (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  filter === tab.key ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
                  tab.key === 'overdue' && filter !== 'overdue' && count > 0 && 'border-red-200 text-red-600',
                )}>
                {tab.key === 'overdue' && filter !== 'overdue' && count > 0 && <AlertCircle size={12} />}
                {isAr ? tab.ar : tab.en}
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                  filter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-shrink-0">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث بالاسم أو رقم الفاتورة...' : 'Search by name or invoice #...'}
            className="rounded-xl border border-slate-200 bg-white ps-9 pe-9 py-2.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileText size={48} />}
          title={isAr ? 'لا توجد فواتير' : 'No invoices yet'}
          description={isAr ? 'ستظهر الفواتير هنا بعد تأكيد الحجوزات' : 'Invoices appear here after confirming bookings'} />
      ) : (
        <Card padding="none">

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-surface-border">
            {filtered.map(inv => {
              const customerName = isAr ? (inv.buyerNameAr ?? '') : (inv.buyerNameEn ?? inv.buyerNameAr ?? '');
              const balance   = inv.totalHalalas - inv.paidHalalas;
              const overdue   = isOverdue(inv);
              const isCN      = inv.type === '381';

              return (
                <Link key={inv.id} href={`/${locale}/invoices/${inv.id}`}
                  className={cn('flex flex-col gap-2 px-4 py-3.5 hover:bg-slate-50 transition-colors', overdue && 'bg-red-50/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="font-mono text-xs font-bold text-brand-700">{inv.invoiceNumber}</span>
                      {isCN && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">{isAr ? 'إشعار دائن' : 'CN'}</span>}
                      {overdue && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5"><AlertTriangle size={9} />{isAr ? 'متأخر' : 'Overdue'}</span>}
                    </div>
                    <InvoiceStatusBadge status={inv.status} locale={locale} />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">{customerName || '—'}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{formatDate(inv.issueDate, fmtLocale)}</span>
                    <div className="flex items-center gap-2">
                      {balance > 0 && <span className="text-xs font-semibold text-red-600">{isAr ? 'متبقي ' : 'Due '}{formatCurrency(balance, fmtLocale)}</span>}
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(inv.totalHalalas, fmtLocale)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60">
                  <th className="text-start ps-6 pe-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-end px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
                  <th className="text-end pe-5 px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{isAr ? 'المتبقي' : 'Balance'}</th>
                  <th className="w-20 pe-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(inv => {
                  const customerName = isAr ? (inv.buyerNameAr ?? '') : (inv.buyerNameEn ?? inv.buyerNameAr ?? '');
                  const balance   = inv.totalHalalas - inv.paidHalalas;
                  const overdue   = isOverdue(inv);
                  const isCN      = inv.type === '381';

                  return (
                    <tr key={inv.id} className={cn('hover:bg-slate-50/60 transition-colors group', overdue && 'bg-red-50/30')}>
                      <td className="ps-6 pe-3 py-4">
                        <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-sm font-bold text-brand-700 hover:underline">{inv.invoiceNumber}</Link>
                        {isCN && <span className="ms-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">{isAr ? 'إشعار دائن' : 'Credit Note'}</span>}
                        {overdue && <span className="ms-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-0.5"><AlertTriangle size={9} />{isAr ? 'متأخر' : 'Overdue'}</span>}
                      </td>
                      <td className="px-3 py-4"><p className="text-sm font-semibold text-slate-900">{customerName || '—'}</p></td>
                      <td className="px-3 py-4 hidden sm:table-cell">
                        <span className="text-sm text-slate-500">{formatDate(inv.issueDate, fmtLocale)}</span>
                      </td>
                      <td className="px-3 py-4"><InvoiceStatusBadge status={inv.status} locale={locale} /></td>
                      <td className="px-3 py-4 text-end">
                        <span className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(inv.totalHalalas, fmtLocale)}</span>
                      </td>
                      <td className="pe-5 px-3 py-4 text-end hidden lg:table-cell">
                        {balance > 0
                          ? <span className="text-sm font-bold tabular-nums text-red-600">{formatCurrency(balance, fmtLocale)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="pe-5 px-3 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/${locale}/invoices/${inv.id}/print`}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Printer size={14} /></Link>
                          <Link href={`/${locale}/invoices/${inv.id}`}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><ChevronRight size={14} /></Link>
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
              {isAr ? `${formatCount(filtered.length, fmtLocale)} فاتورة` : `${filtered.length} invoices`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
