'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import { Search, X, Ticket, RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  type PnrRow,
  type ComputedStatus,
  STATUS_CONFIG,
  computeStatus,
  formatDate,
  formatDateTime,
  segmentCount,
  routeLabel,
} from './pnr-types';
import { PnrDrawer } from './PnrDrawer';

// ─── Status badge (inline, used in table rows) ────────────────────────────────

function StatusBadge({ status, isAr }: { status: ComputedStatus; isAr: boolean }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cfg.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotColor}`} />
      {isAr ? cfg.labelAr : cfg.labelEn}
    </span>
  );
}

// ─── Filter options ────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { value: '',           labelAr: 'كل الحالات',        labelEn: 'All Statuses' },
  { value: 'active',     labelAr: 'نشط',               labelEn: 'Active' },
  { value: 'ticketed',   labelAr: 'مصدَّر',             labelEn: 'Ticketed' },
  { value: 'cancelled',  labelAr: 'ملغى',               labelEn: 'Cancelled' },
  { value: 'expired',    labelAr: 'منتهي',              labelEn: 'Expired' },
  { value: 'voided',     labelAr: 'ملغى (void)',        labelEn: 'Voided' },
  { value: 'refunded',   labelAr: 'مسترد',              labelEn: 'Refunded' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function PnrListClient() {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [records,  setRecords]  = useState<PnrRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [selected, setSelected] = useState<PnrRow | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecords = useCallback(async (q: string, st: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q)  params.set('q', q);
      if (st) params.set('status', st);
      const qs = params.toString();
      const data = await apiFetch<{ pnrRecords: PnrRow[] }>(`/api/pnr${qs ? `?${qs}` : ''}`);
      setRecords(data.pnrRecords);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchRecords(search, status);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, status, fetchRecords]);

  function handleRowClick(pnr: PnrRow) {
    setSelected(pnr);
  }

  const handlePnrRefresh = useCallback(async (pnrId: string) => {
    try {
      const data = await apiFetch<{ pnr: PnrRow }>(`/api/pnr/${pnrId}`);
      const updated = data.pnr;
      setRecords(prev => prev.map(r => r.id === pnrId ? updated : r));
      setSelected(updated);
    } catch {
      setSelected(null);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-surface-border bg-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isAr ? 'إدارة PNR' : 'PNR Management'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isAr
                ? 'سجلات PNR من مزودي GDS'
                : 'PNR records from GDS providers'}
            </p>
          </div>
          <button
            onClick={() => void fetchRecords(search, status)}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 shrink-0"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr
                ? 'بحث برمز PNR أو اسم الراكب...'
                : 'Search by PNR code or passenger name...'}
              className="w-full border border-slate-200 rounded-xl ps-9 pe-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white text-slate-700 min-w-[160px]"
          >
            {STATUS_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {isAr ? opt.labelAr : opt.labelEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table / states ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-slate-50">

        {/* Loading skeleton */}
        {loading && records.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={22} className="animate-spin text-slate-300" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && records.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Ticket size={44} className="text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">
              {isAr ? 'لا توجد سجلات PNR' : 'No PNR records found'}
            </p>
            <p className="text-xs text-slate-400 max-w-xs text-center">
              {search || status
                ? (isAr ? 'حاول تغيير معايير البحث' : 'Try different search criteria')
                : (isAr
                    ? 'استخدم البحث المباشر عبر GDS لإنشاء PNRs جديدة'
                    : 'Use GDS Live Search to create new PNRs')}
            </p>
          </div>
        )}

        {/* Table */}
        {records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white border-b border-slate-100 shadow-sm">
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'رمز PNR' : 'PNR Code'}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'الحالة' : 'Status'}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'المزود' : 'Provider'}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'الخط' : 'Route'}
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'ركاب' : 'PAX'}
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'قطاعات' : 'Segs'}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'ينتهي في' : 'Expires'}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'آخر مزامنة' : 'Last Sync'}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs">
                    {isAr ? 'الإنشاء' : 'Created'}
                  </th>
                  <th className="px-2 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {records.map(pnr => {
                  const computed = computeStatus(pnr);
                  const isSelected = selected?.id === pnr.id;
                  return (
                    <tr
                      key={pnr.id}
                      onClick={() => handleRowClick(pnr)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-brand-50'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      {/* PNR Code */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-900 tracking-widest text-sm">
                          {pnr.pnrCode}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={computed} isAr={isAr} />
                      </td>

                      {/* Provider */}
                      <td className="px-4 py-3 text-slate-500 uppercase font-mono text-xs">
                        {pnr.gds ?? '—'}
                      </td>

                      {/* Route */}
                      <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap font-mono text-xs">
                        {routeLabel(pnr)}
                      </td>

                      {/* PAX */}
                      <td className="px-3 py-3 text-center text-slate-700 text-xs">
                        {pnr.passengerCount}
                      </td>

                      {/* Segments */}
                      <td className="px-3 py-3 text-center text-slate-700 text-xs">
                        {segmentCount(pnr) || <span className="text-slate-300">—</span>}
                      </td>

                      {/* Expires */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {pnr.expiresAt ? (
                          <span className={new Date(pnr.expiresAt) < new Date() ? 'text-orange-600 font-semibold' : 'text-slate-600'}>
                            {formatDate(pnr.expiresAt, isAr)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Last Sync */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {pnr.syncedAt ? (
                          <span className={pnr.syncStatus === 'failed' ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                            {formatDateTime(pnr.syncedAt, isAr)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(pnr.createdAt, isAr)}
                      </td>

                      {/* Arrow */}
                      <td className="px-2 py-3 text-slate-300">
                        {isAr
                          ? <ChevronLeft size={14} />
                          : <ChevronRight size={14} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Count footer ──────────────────────────────────────────────────────── */}
      {!loading && records.length > 0 && (
        <div className="px-6 py-2.5 bg-white border-t border-slate-100 text-xs text-slate-400">
          {isAr
            ? `${records.length} سجل PNR`
            : `${records.length} PNR record${records.length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* ── Detail drawer ─────────────────────────────────────────────────────── */}
      {selected && (
        <PnrDrawer
          pnr={selected}
          computedStatus={computeStatus(selected)}
          isAr={isAr}
          onClose={() => setSelected(null)}
          onRefresh={pnrId => void handlePnrRefresh(pnrId)}
        />
      )}
    </div>
  );
}
