'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  FileText, Search, X, Download, Printer, TrendingUp,
  CheckCircle2, Clock, AlertCircle, AlertTriangle,
  ChevronRight,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  type: string;
  status: string;
  paymentStatus: string;
  amountDue: number;
  amountPaid: number;
  buyer?: { name?: { ar?: string; en?: string }; phone?: string };
  totals?: { grandTotal?: number };
  issueDate?: { toDate?: () => Date };
  dueDate?: { toDate?: () => Date };
  createdAt?: { toDate?: () => Date };
}

type StatusFilter = 'all' | 'unpaid' | 'partial' | 'fully_paid' | 'overdue';
interface InvoicesClientProps { locale: string }

export function InvoicesClient({ locale }: InvoicesClientProps) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<StatusFilter>('all');

  const agencyId = user?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    async function subscribe() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const q = query(collection(getFirestore(getApp()), 'invoices'), where('agencyId', '==', agencyId));
      unsub = onSnapshot(q, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
        docs.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
        setInvoices(docs);
        setLoading(false);
      }, () => setLoading(false));
    }
    void subscribe();
    return () => unsub?.();
  }, [agencyId]);

  const now = Date.now();

  function isOverdue(inv: Invoice) {
    if (inv.paymentStatus === 'fully_paid') return false;
    const due = inv.dueDate?.toDate?.()?.getTime();
    return due ? due < now : false;
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalRevenue  = invoices.reduce((s, i) => s + (i.totals?.grandTotal ?? 0), 0);
  const totalPaid     = invoices.reduce((s, i) => s + (i.amountPaid ?? 0), 0);
  const totalDue      = invoices.reduce((s, i) => s + (i.amountDue ?? 0), 0);
  const overdueCount  = invoices.filter(isOverdue).length;

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      const name = isAr ? inv.buyer?.name?.ar ?? '' : inv.buyer?.name?.en ?? inv.buyer?.name?.ar ?? '';
      const matchSearch = !q || inv.invoiceNumber?.toLowerCase().includes(q) || name.toLowerCase().includes(q);
      let matchFilter = true;
      if      (filter === 'overdue')    matchFilter = isOverdue(inv);
      else if (filter !== 'all')        matchFilter = inv.paymentStatus === filter;
      return matchSearch && matchFilter;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, search, filter, isAr, now]);

  const STATUS_TABS: { key: StatusFilter; ar: string; en: string }[] = [
    { key: 'all',        ar: 'الكل',         en: 'All' },
    { key: 'unpaid',     ar: 'غير مدفوع',    en: 'Unpaid' },
    { key: 'partial',    ar: 'دفع جزئي',     en: 'Partial' },
    { key: 'fully_paid', ar: 'مدفوع',        en: 'Paid' },
    { key: 'overdue',    ar: 'متأخر',        en: 'Overdue' },
  ];

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الفواتير' : 'Invoices'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isAr ? 'إدارة فواتير العملاء وتتبع المدفوعات' : 'Manage customer invoices and track payments'}</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
          <Download size={14} />
          {isAr ? 'تصدير' : 'Export'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp,   bg: 'bg-brand-50',   color: 'text-brand-600',   accent: 'border-brand-500',   label: isAr ? 'إجمالي الفواتير' : 'Total Invoiced',     value: formatCurrency(totalRevenue, fmtLocale) },
          { icon: CheckCircle2, bg: 'bg-emerald-50', color: 'text-emerald-600', accent: 'border-emerald-500', label: isAr ? 'إجمالي المحصّل' : 'Total Collected',     value: formatCurrency(totalPaid, fmtLocale) },
          { icon: Clock,        bg: 'bg-amber-50',   color: 'text-amber-600',   accent: 'border-amber-500',   label: isAr ? 'مستحق التحصيل' : 'Outstanding',          value: formatCurrency(totalDue, fmtLocale) },
          { icon: AlertTriangle,bg: 'bg-red-50',     color: 'text-red-600',     accent: 'border-red-500',     label: isAr ? 'متأخرة السداد' : 'Overdue',              value: formatCount(overdueCount, fmtLocale) },
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

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto pb-px flex-1">
          {STATUS_TABS.map(tab => {
            let count = 0;
            if      (tab.key === 'all')     count = invoices.length;
            else if (tab.key === 'overdue') count = overdueCount;
            else                            count = invoices.filter(i => i.paymentStatus === tab.key).length;
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

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={<FileText size={48} />}
          title={isAr ? 'لا توجد فواتير' : 'No invoices yet'}
          description={isAr ? 'ستظهر الفواتير هنا بعد تأكيد الحجوزات' : 'Invoices appear here after confirming bookings'} />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60">
                  <th className="text-start ps-6 pe-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="text-end px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
                  <th className="text-end pe-5 px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{isAr ? 'المتبقي' : 'Balance'}</th>
                  <th className="w-20 pe-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(inv => {
                  const customerName = isAr ? inv.buyer?.name?.ar ?? '' : inv.buyer?.name?.en ?? inv.buyer?.name?.ar ?? '';
                  const issueDate = inv.issueDate?.toDate?.() ?? inv.createdAt?.toDate?.() ?? null;
                  const dueDate   = inv.dueDate?.toDate?.() ?? null;
                  const grandTotal = inv.totals?.grandTotal ?? 0;
                  const balance    = inv.amountDue ?? 0;
                  const overdue    = isOverdue(inv);
                  const isCreditNote = inv.type === 'credit_note';

                  return (
                    <tr key={inv.id} className={cn('hover:bg-slate-50/60 transition-colors group', overdue && 'bg-red-50/30')}>
                      <td className="ps-6 pe-3 py-4">
                        <Link href={`/${locale}/invoices/${inv.id}`}
                          className="font-mono text-sm font-bold text-brand-700 hover:underline">
                          {inv.invoiceNumber ?? inv.id.slice(0, 10)}
                        </Link>
                        {isCreditNote && (
                          <span className="ms-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                            {isAr ? 'إشعار دائن' : 'Credit Note'}
                          </span>
                        )}
                        {overdue && (
                          <span className="ms-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 inline-flex items-center gap-0.5">
                            <AlertTriangle size={9} />
                            {isAr ? 'متأخر' : 'Overdue'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-sm font-semibold text-slate-900">{customerName || '—'}</p>
                      </td>
                      <td className="px-3 py-4 hidden sm:table-cell">
                        <span className="text-sm text-slate-500">{issueDate ? formatDate(issueDate, fmtLocale) : '—'}</span>
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        {dueDate ? (
                          <span className={cn('text-sm', overdue ? 'text-red-600 font-semibold' : 'text-slate-500')}>
                            {formatDate(dueDate, fmtLocale)}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-4">
                        <InvoiceStatusBadge status={inv.paymentStatus as any} locale={locale} />
                      </td>
                      <td className="px-3 py-4 text-end">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {formatCurrency(grandTotal, fmtLocale)}
                        </span>
                      </td>
                      <td className="pe-5 px-3 py-4 text-end hidden lg:table-cell">
                        {balance > 0 ? (
                          <span className="text-sm font-bold tabular-nums text-red-600">{formatCurrency(balance, fmtLocale)}</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="pe-5 px-3 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/${locale}/invoices/${inv.id}/print`}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                            title={isAr ? 'طباعة' : 'Print'}>
                            <Printer size={14} />
                          </Link>
                          <Link href={`/${locale}/invoices/${inv.id}`}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                            <ChevronRight size={14} />
                          </Link>
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
