'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { TicketDrawer } from './TicketDrawer';
import { cn } from '@/lib/utils';
import {
  Search, X, FileSearch, AlertTriangle, Clock, CheckCircle2,
  XCircle, RefreshCw, AlertCircle, Ticket, ArrowRight,
} from 'lucide-react';
import type { Ticket as TicketRow } from '@/lib/schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketWithPnr = TicketRow & { pnrCode: string | null };

// ─── Status helpers ───────────────────────────────────────────────────────────

const PENDING_STATUSES = new Set(['pending', 'pending_void', 'pending_refund', 'pending_exchange']);

const STATUS_META: Record<string, { ar: string; en: string; bg: string; text: string; icon: React.ReactNode }> = {
  pending:          { ar: 'معلق',        en: 'Pending',    bg: 'bg-amber-50',    text: 'text-amber-700',   icon: <Clock size={10} /> },
  active:           { ar: 'نشط',         en: 'Active',     bg: 'bg-emerald-50',  text: 'text-emerald-700', icon: <CheckCircle2 size={10} /> },
  pending_void:     { ar: 'إلغاء جارٍ',  en: 'Voiding',    bg: 'bg-orange-50',   text: 'text-orange-700',  icon: <Clock size={10} /> },
  void:             { ar: 'مُلغى',       en: 'Void',       bg: 'bg-red-50',      text: 'text-red-600',     icon: <XCircle size={10} /> },
  pending_refund:   { ar: 'استرداد جارٍ', en: 'Refunding', bg: 'bg-purple-50',   text: 'text-purple-600',  icon: <Clock size={10} /> },
  refunded:         { ar: 'مُسترد',      en: 'Refunded',   bg: 'bg-purple-50',   text: 'text-purple-700',  icon: <RefreshCw size={10} /> },
  pending_exchange: { ar: 'تبادل جارٍ',  en: 'Exchanging', bg: 'bg-blue-50',     text: 'text-blue-700',    icon: <Clock size={10} /> },
  exchanged:        { ar: 'مُبادَل',     en: 'Exchanged',  bg: 'bg-sky-50',      text: 'text-sky-700',     icon: <RefreshCw size={10} /> },
};

type StatusFilter = 'all' | 'pending' | 'active' | 'void' | 'refunded';

const STATUS_TABS: { id: StatusFilter; ar: string; en: string }[] = [
  { id: 'all',      ar: 'الكل',     en: 'All' },
  { id: 'active',   ar: 'نشط',      en: 'Active' },
  { id: 'pending',  ar: 'معلق',     en: 'Pending' },
  { id: 'void',     ar: 'مُلغى',    en: 'Void' },
  { id: 'refunded', ar: 'مُسترد',   en: 'Refunded' },
];

function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const meta = STATUS_META[status] ?? { ar: status, en: status, bg: 'bg-slate-100', text: 'text-slate-500', icon: null };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md', meta.bg, meta.text)}>
      {meta.icon}
      {isAr ? meta.ar : meta.en}
    </span>
  );
}

function OrphanBadge({ isAr }: { isAr: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200">
      <AlertCircle size={8} />
      {isAr ? 'يتيم' : 'Orphan'}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider) return <span className="text-slate-400 text-xs">—</span>;
  const colors: Record<string, string> = {
    amadeus: 'bg-blue-50 text-blue-700',
    sabre: 'bg-red-50 text-red-700',
    galileo: 'bg-purple-50 text-purple-700',
    worldspan: 'bg-orange-50 text-orange-700',
    manual: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase', colors[provider] ?? 'bg-slate-100 text-slate-500')}>
      {provider}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locale: string }

export function TicketListClient({ locale }: Props) {
  const isAr    = locale === 'ar';
  const _locale = useLocale();
  const router  = useRouter();

  const [records,    setRecords]    = useState<TicketWithPnr[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<StatusFilter>('all');
  const [selected,   setSelected]   = useState<TicketWithPnr | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // One-time check for pending tickets (monitoring banner)
  useEffect(() => {
    apiFetch<{ tickets: TicketWithPnr[] }>('/api/tickets?status=pending')
      .then(d => setPendingCount(d.tickets.length))
      .catch(() => {});
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      // 'pending' tab fetches all then filters client-side (covers all pending_* variants)
      const apiStatus = filter === 'all' || filter === 'pending' ? undefined : filter;
      if (apiStatus) params.set('status', apiStatus);
      const qs = params.toString();
      const data = await apiFetch<{ tickets: TicketWithPnr[] }>(`/api/tickets${qs ? `?${qs}` : ''}`);
      setRecords(data.tickets ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // Client-side filtering for 'pending' tab and search
  const displayed = useMemo(() => {
    let rows = filter === 'pending'
      ? records.filter(r => PENDING_STATUSES.has(r.status))
      : records;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        (r.ticketNumber ?? '').toLowerCase().includes(q) ||
        r.passengerName.toLowerCase().includes(q) ||
        (r.pnrCode ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [records, filter, search]);

  function openDrawer(t: TicketWithPnr) {
    setSelected(t);
    setDrawerOpen(true);
  }

  function handleDrawerChange(updated: TicketWithPnr) {
    setSelected(updated);
    setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  function formatAmount(halalas: number): string {
    return (halalas / 100).toLocaleString(isAr ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2 });
  }

  return (
    <>
      {/* Monitoring banner */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 text-amber-600" />
          <span className="flex-1">
            {isAr
              ? `يوجد ${pendingCount} تذكرة في حالة معلقة — قد تحتاج إلى مراجعة أو إعادة مصالحة.`
              : `${pendingCount} ticket${pendingCount !== 1 ? 's' : ''} in pending state — may require review or reconciliation.`}
          </span>
          <button
            onClick={() => setFilter('pending')}
            className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            {isAr ? 'عرض' : 'View'}
            <ArrowRight size={12} className={isAr ? 'rotate-180' : ''} />
          </button>
        </div>
      )}

      <Card padding="none">
        {/* Toolbar */}
        <div className="p-4 border-b border-surface-border">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'بحث برقم التذكرة أو PNR أو اسم الراكب...' : 'Search by ticket #, PNR or passenger...'}
              className="ps-8 pe-8"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-0 border-b border-surface-border overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                filter === tab.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {isAr ? tab.ar : tab.en}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 flex justify-center"><Spinner size="sm" /></div>
        ) : error ? (
          <div className="py-10 flex flex-col items-center gap-2 text-sm text-red-600">
            <AlertTriangle size={20} />
            {error}
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <Ticket size={36} className="text-slate-300" />
            <p className="text-sm font-medium">
              {isAr ? 'لا توجد تذاكر' : 'No tickets found'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="text-xs text-brand-600 hover:underline">
                {isAr ? 'مسح البحث' : 'Clear search'}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60 text-xs text-slate-500 font-medium">
                  <th className="px-4 py-3 text-start">{isAr ? 'رقم التذكرة' : 'Ticket #'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'PNR' : 'PNR'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الراكب' : 'Passenger'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المزود' : 'Provider'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'تاريخ الإصدار' : 'Issued'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {displayed.map(ticket => {
                  const isOrphan = ticket.reconciliationAttempts >= 20 && PENDING_STATUSES.has(ticket.status);
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => openDrawer(ticket)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-900 font-semibold">
                        <div className="flex flex-col gap-0.5">
                          <span>{ticket.ticketNumber ?? <span className="text-slate-400">—</span>}</span>
                          {isOrphan && <OrphanBadge isAr={isAr} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-brand-700">
                        {ticket.pnrCode ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs">
                        {ticket.passengerName}
                      </td>
                      <td className="px-4 py-3">
                        <ProviderBadge provider={ticket.issuingProvider} />
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs tabular-nums">
                        {ticket.totalHalalas > 0 ? formatAmount(ticket.totalHalalas) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {ticket.issuedAt
                          ? new Date(ticket.issuedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={ticket.status} isAr={isAr} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && !error && displayed.length > 0 && (
          <div className="px-4 py-2.5 border-t border-surface-border text-xs text-slate-400">
            {isAr ? `${displayed.length} تذكرة` : `${displayed.length} tickets`}
          </div>
        )}
      </Card>

      {/* Drawer */}
      {drawerOpen && selected && (
        <TicketDrawer
          ticket={selected}
          isAr={isAr}
          onClose={() => setDrawerOpen(false)}
          onChange={handleDrawerChange}
        />
      )}
    </>
  );
}
