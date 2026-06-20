'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { MobileList, MobileListItem, MobileItemHeader, MobileItemFooter } from '@/components/ui/MobileList';
import { PnrDrawer } from './PnrDrawer';
import { cn } from '@/lib/utils';
import {
  Search, X, FileSearch, Clock, CheckCircle2,
  XCircle, Ticket, AlertTriangle, RefreshCw,
} from 'lucide-react';
import type { PnrRecord } from '@/lib/schema';

// ─── Status helpers ───────────────────────────────────────────────────────────

export function computeDisplayStatus(pnr: PnrRecord): string {
  if (pnr.status === 'active' && pnr.expiresAt && new Date(pnr.expiresAt) < new Date()) {
    return 'expired';
  }
  return pnr.status;
}

const STATUS_META: Record<string, { ar: string; en: string; bg: string; text: string; icon: React.ReactNode }> = {
  active:    { ar: 'نشط',       en: 'Active',     bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle2 size={10} /> },
  ticketed:  { ar: 'مُصدَر',    en: 'Ticketed',   bg: 'bg-brand-50',   text: 'text-brand-700',   icon: <Ticket size={10} /> },
  expired:   { ar: 'منتهي',     en: 'Expired',    bg: 'bg-amber-50',   text: 'text-amber-700',   icon: <Clock size={10} /> },
  cancelled: { ar: 'ملغي',      en: 'Cancelled',  bg: 'bg-slate-100',  text: 'text-slate-500',   icon: <XCircle size={10} /> },
  voided:    { ar: 'مُلغى BSP', en: 'Voided',     bg: 'bg-red-50',     text: 'text-red-600',     icon: <XCircle size={10} /> },
  refunded:  { ar: 'مُسترد',    en: 'Refunded',   bg: 'bg-purple-50',  text: 'text-purple-700',  icon: <RefreshCw size={10} /> },
};

type StatusFilter = 'all' | 'active' | 'expired' | 'cancelled' | 'ticketed';

const STATUS_TABS: { id: StatusFilter; ar: string; en: string }[] = [
  { id: 'all',       ar: 'الكل',    en: 'All' },
  { id: 'active',    ar: 'نشط',     en: 'Active' },
  { id: 'expired',   ar: 'منتهي',   en: 'Expired' },
  { id: 'ticketed',  ar: 'مُصدَر',  en: 'Ticketed' },
  { id: 'cancelled', ar: 'ملغي',    en: 'Cancelled' },
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

function GdsBadge({ gds }: { gds: string | null }) {
  if (!gds) return <span className="text-slate-400 text-xs">—</span>;
  const colors: Record<string, string> = {
    amadeus:   'bg-blue-50 text-blue-700',
    sabre:     'bg-red-50 text-red-700',
    galileo:   'bg-purple-50 text-purple-700',
    worldspan: 'bg-orange-50 text-orange-700',
    manual:    'bg-slate-100 text-slate-600',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase', colors[gds] ?? 'bg-slate-100 text-slate-500')}>
      {gds}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { locale: string }

export function PnrListClient({ locale }: Props) {
  const isAr   = locale === 'ar';
  const _locale = useLocale();

  const [records,   setRecords]   = useState<PnrRecord[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState<StatusFilter>('all');
  const [selected,  setSelected]  = useState<PnrRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // For 'expired' tab: fetch active records and let client computeDisplayStatus filter
      const apiStatus = filter === 'expired' ? 'active' : filter === 'all' ? undefined : filter;
      const params = new URLSearchParams();
      if (search.trim())  params.set('q', search.trim());
      if (apiStatus)      params.set('status', apiStatus);
      const qs = params.toString();
      const data = await apiFetch<{ pnrRecords: PnrRecord[] }>(`/api/pnr${qs ? `?${qs}` : ''}`);
      setRecords(data.pnrRecords ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    const t = setTimeout(() => { void fetchRecords(); }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchRecords, search]);

  // Client-side filter for 'expired' tab
  const displayed = filter === 'expired'
    ? records.filter(r => computeDisplayStatus(r) === 'expired')
    : records;

  function openDrawer(pnr: PnrRecord) {
    setSelected(pnr);
    setDrawerOpen(true);
  }

  function handleDrawerChange(updated: PnrRecord) {
    setSelected(updated);
    setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  function handleDrawerDelete(id: string) {
    setDrawerOpen(false);
    setRecords(prev => prev.filter(r => r.id !== id));
  }

  return (
    <>
      <Card padding="none">
        {/* ── Toolbar ── */}
        <div className="p-4 border-b border-surface-border flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'بحث بكود PNR أو اسم الراكب...' : 'Search by PNR code or passenger...'}
              className="ps-8 pe-8"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Status tabs ── */}
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

        {/* ── Table ── */}
        {loading ? (
          <div className="py-16 flex justify-center"><Spinner size="sm" /></div>
        ) : error ? (
          <div className="py-10 flex flex-col items-center gap-2 text-sm text-red-600">
            <AlertTriangle size={20} />
            {error}
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <FileSearch size={36} className="text-slate-300" />
            <p className="text-sm font-medium">
              {isAr ? 'لا توجد سجلات PNR' : 'No PNR records found'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="text-xs text-brand-600 hover:underline">
                {isAr ? 'مسح البحث' : 'Clear search'}
              </button>
            )}
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <MobileList>
            {displayed.map(pnr => {
              const displayStatus = computeDisplayStatus(pnr);
              const isExpiring = displayStatus === 'active' && pnr.expiresAt &&
                new Date(pnr.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
              return (
                <MobileListItem key={pnr.id} onClick={() => openDrawer(pnr)}>
                  <MobileItemHeader>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold text-slate-900">{pnr.pnrCode}</span>
                      <GdsBadge gds={pnr.gds} />
                    </span>
                    <StatusBadge status={displayStatus} isAr={isAr} />
                  </MobileItemHeader>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700 truncate">
                      {pnr.origin && pnr.destination ? <span className="font-medium">{pnr.origin} → {pnr.destination}</span> : '—'}
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{pnr.passengerCount} {isAr ? 'راكب' : 'pax'}</span>
                  </div>
                  <MobileItemFooter>
                    <span className="text-xs text-slate-400">{pnr.departureDate ? `${isAr ? 'مغادرة ' : 'Dep '}${pnr.departureDate}` : '—'}</span>
                    {pnr.expiresAt && (
                      <span className={cn('text-xs', isExpiring ? 'text-amber-600 font-medium' : 'text-slate-400')}>
                        {isAr ? 'ينتهي ' : 'Exp '}{new Date(pnr.expiresAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                      </span>
                    )}
                  </MobileItemFooter>
                </MobileListItem>
              );
            })}
          </MobileList>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60 text-xs text-slate-500 font-medium">
                  <th className="px-4 py-3 text-start">{isAr ? 'كود PNR' : 'PNR Code'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المزود' : 'Provider'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الركاب' : 'Pax'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الرحلة' : 'Route'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المغادرة' : 'Departure'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الانتهاء' : 'Expires'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {displayed.map(pnr => {
                  const displayStatus = computeDisplayStatus(pnr);
                  const isExpiring = displayStatus === 'active' && pnr.expiresAt &&
                    new Date(pnr.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
                  return (
                    <tr
                      key={pnr.id}
                      onClick={() => openDrawer(pnr)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 text-xs">
                        {pnr.pnrCode}
                      </td>
                      <td className="px-4 py-3"><GdsBadge gds={pnr.gds} /></td>
                      <td className="px-4 py-3 text-slate-600">{pnr.passengerCount}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {pnr.origin && pnr.destination
                          ? <span className="font-medium">{pnr.origin} → {pnr.destination}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {pnr.departureDate ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {pnr.expiresAt ? (
                          <span className={cn(isExpiring && displayStatus === 'active' ? 'text-amber-600 font-medium' : 'text-slate-500')}>
                            {new Date(pnr.expiresAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={displayStatus} isAr={isAr} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* ── Footer count ── */}
        {!loading && !error && displayed.length > 0 && (
          <div className="px-4 py-2.5 border-t border-surface-border text-xs text-slate-400">
            {isAr ? `${displayed.length} سجل` : `${displayed.length} records`}
          </div>
        )}
      </Card>

      {/* ── Drawer ── */}
      {drawerOpen && selected && (
        <PnrDrawer
          pnr={selected}
          isAr={isAr}
          onClose={() => setDrawerOpen(false)}
          onChange={handleDrawerChange}
          onDelete={handleDrawerDelete}
        />
      )}
    </>
  );
}
