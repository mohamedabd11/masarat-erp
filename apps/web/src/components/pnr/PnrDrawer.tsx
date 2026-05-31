'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { computeDisplayStatus } from './PnrListClient';
import type { PnrRecord, PnrSegmentJson, PnrPassengerJson } from '@/lib/schema';
import {
  X, RefreshCw, XCircle, Link2, User, BookOpen,
  Plane, Users, Map, Clock, CheckCircle2, AlertTriangle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  pnr:      PnrRecord;
  isAr:     boolean;
  onClose:  () => void;
  onChange: (updated: PnrRecord) => void;
  onDelete: (id: string) => void;
}

type DrawerTab = 'overview' | 'passengers' | 'segments';

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0 gap-4">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-900 text-end">{value ?? '—'}</span>
    </div>
  );
}

function StatusChip({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { ar: string; en: string; cls: string }> = {
    active:    { ar: 'نشط',       en: 'Active',    cls: 'bg-emerald-50 text-emerald-700' },
    ticketed:  { ar: 'مُصدَر',    en: 'Ticketed',  cls: 'bg-brand-50 text-brand-700' },
    expired:   { ar: 'منتهي',     en: 'Expired',   cls: 'bg-amber-50 text-amber-700' },
    cancelled: { ar: 'ملغي',      en: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
    voided:    { ar: 'مُلغى BSP', en: 'Voided',    cls: 'bg-red-50 text-red-600' },
    refunded:  { ar: 'مُسترد',    en: 'Refunded',  cls: 'bg-purple-50 text-purple-700' },
  };
  const m = map[status] ?? { ar: status, en: status, cls: 'bg-slate-100 text-slate-500' };
  return <span className={cn('text-[11px] font-semibold px-2 py-1 rounded-md', m.cls)}>{isAr ? m.ar : m.en}</span>;
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

export function PnrDrawer({ pnr, isAr, onClose, onChange, onDelete }: Props) {
  const [tab,          setTab]          = useState<DrawerTab>('overview');
  const [saving,       setSaving]       = useState(false);
  const [actionError,  setActionError]  = useState('');
  const [linkCustomer, setLinkCustomer] = useState(false);
  const [customerId,   setCustomerId]   = useState(pnr.customerId ?? '');
  const [linkBooking,  setLinkBooking]  = useState(false);
  const [bookingId,    setBookingId]    = useState(pnr.bookingId ?? '');

  const displayStatus = computeDisplayStatus(pnr);
  const canCancel     = displayStatus === 'active';
  const canSync       = displayStatus === 'active' || displayStatus === 'expired';

  const segments:  PnrSegmentJson[]   = Array.isArray(pnr.segments)  ? (pnr.segments  as PnrSegmentJson[])  : [];
  const passengers: PnrPassengerJson[] = Array.isArray(pnr.passengers) ? (pnr.passengers as PnrPassengerJson[]) : [];

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setActionError('');
    try {
      const { pnr: updated } = await apiFetch<{ pnr: PnrRecord }>(
        `/api/pnr/${pnr.id}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      onChange(updated);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSaving(true);
    setActionError('');
    try {
      const { pnr: refreshed } = await apiFetch<{ pnr: PnrRecord }>(`/api/pnr/${pnr.id}`);
      onChange(refreshed);
    } catch (e) {
      setActionError((e as Error).message);
    } finally { setSaving(false); }
  }

  async function handleCancel() {
    if (!confirm(isAr ? 'هل أنت متأكد من إلغاء هذا الحجز؟' : 'Cancel this reservation?')) return;
    await patch({ status: 'cancelled' });
  }

  async function handleLinkCustomer() {
    if (!customerId.trim()) return;
    await patch({ customerId: customerId.trim() });
    setLinkCustomer(false);
  }

  async function handleLinkBooking() {
    if (!bookingId.trim()) return;
    await patch({ bookingId: bookingId.trim() });
    setLinkBooking(false);
  }

  const TABS: { id: DrawerTab; ar: string; en: string; icon: React.ReactNode }[] = [
    { id: 'overview',   ar: 'نظرة عامة',  en: 'Overview',    icon: <Map size={14} /> },
    { id: 'passengers', ar: 'الركاب',      en: 'Passengers',  icon: <Users size={14} /> },
    { id: 'segments',   ar: 'الرحلات',    en: 'Segments',    icon: <Plane size={14} /> },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <p className="font-mono font-bold text-slate-900 text-base">{pnr.pnrCode}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusChip status={displayStatus} isAr={isAr} />
              {pnr.gds && (
                <span className="text-[10px] text-slate-400 uppercase font-medium">{pnr.gds}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex-wrap">
          {canSync && (
            <button
              onClick={() => void handleSync()}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {saving ? <Spinner size="sm" /> : <RefreshCw size={12} />}
              {isAr ? 'تحديث' : 'Sync'}
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => void handleCancel()}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <XCircle size={12} />
              {isAr ? 'إلغاء الحجز' : 'Cancel'}
            </button>
          )}
          <button
            onClick={() => { setLinkCustomer(v => !v); setLinkBooking(false); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <User size={12} />
            {isAr ? 'ربط عميل' : 'Link Customer'}
          </button>
          <button
            onClick={() => { setLinkBooking(v => !v); setLinkCustomer(false); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <BookOpen size={12} />
            {isAr ? 'ربط حجز' : 'Link Booking'}
          </button>
        </div>

        {/* Link customer inline form */}
        {linkCustomer && (
          <div className="px-5 py-3 border-b border-slate-100 bg-brand-50/30 flex items-center gap-2">
            <Link2 size={14} className="text-brand-500 shrink-0" />
            <Input
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              placeholder={isAr ? 'معرّف العميل...' : 'Customer ID...'}
              className="flex-1 text-xs h-8"
            />
            <Button size="sm" onClick={() => void handleLinkCustomer()} disabled={saving || !customerId.trim()}>
              {isAr ? 'ربط' : 'Link'}
            </Button>
            <button onClick={() => setLinkCustomer(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
        )}

        {/* Link booking inline form */}
        {linkBooking && (
          <div className="px-5 py-3 border-b border-slate-100 bg-brand-50/30 flex items-center gap-2">
            <Link2 size={14} className="text-brand-500 shrink-0" />
            <Input
              value={bookingId}
              onChange={e => setBookingId(e.target.value)}
              placeholder={isAr ? 'معرّف الحجز...' : 'Booking ID...'}
              className="flex-1 text-xs h-8"
            />
            <Button size="sm" onClick={() => void handleLinkBooking()} disabled={saving || !bookingId.trim()}>
              {isAr ? 'ربط' : 'Link'}
            </Button>
            <button onClick={() => setLinkBooking(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle size={12} />{actionError}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors',
                tab === t.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t.icon}
              {isAr ? t.ar : t.en}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Overview */}
          {tab === 'overview' && (
            <div className="space-y-1">
              <InfoRow label={isAr ? 'كود PNR' : 'PNR Code'} value={<span className="font-mono">{pnr.pnrCode}</span>} />
              <InfoRow label={isAr ? 'المزود' : 'Provider'} value={pnr.gds?.toUpperCase() ?? null} />
              <InfoRow label={isAr ? 'الطيران' : 'Airline'} value={pnr.airline} />
              <InfoRow label={isAr ? 'أرقام الرحلات' : 'Flights'} value={pnr.flightNumbers} />
              <InfoRow label={isAr ? 'المسار' : 'Route'} value={
                pnr.origin && pnr.destination ? `${pnr.origin} → ${pnr.destination}` : null
              } />
              <InfoRow label={isAr ? 'تاريخ المغادرة' : 'Departure'} value={pnr.departureDate} />
              <InfoRow label={isAr ? 'تاريخ العودة' : 'Return'} value={pnr.returnDate} />
              <InfoRow label={isAr ? 'عدد الركاب' : 'Passengers'} value={pnr.passengerCount} />
              <InfoRow label={isAr ? 'أسماء الركاب' : 'Names'} value={
                <span className="max-w-[180px] text-end leading-relaxed">{pnr.passengerNames}</span>
              } />
              <InfoRow label={isAr ? 'ينتهي في' : 'Expires'} value={
                pnr.expiresAt ? (
                  <span className={cn(
                    computeDisplayStatus(pnr) === 'expired' ? 'text-amber-600 font-semibold' : 'text-slate-900',
                  )}>
                    {new Date(pnr.expiresAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                    {computeDisplayStatus(pnr) === 'expired' && (
                      <span className="ms-1 text-amber-600"><Clock size={10} className="inline" /></span>
                    )}
                  </span>
                ) : null
              } />
              <InfoRow label={isAr ? 'ربط بعميل' : 'Customer ID'} value={pnr.customerId} />
              <InfoRow label={isAr ? 'ربط بحجز' : 'Booking ID'} value={pnr.bookingId} />
              <InfoRow label={isAr ? 'حالة المزامنة' : 'Sync Status'} value={
                pnr.syncStatus ? (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                    pnr.syncStatus === 'success' ? 'bg-emerald-50 text-emerald-700' :
                    pnr.syncStatus === 'failed'  ? 'bg-red-50 text-red-600' :
                    'bg-slate-100 text-slate-500',
                  )}>
                    {pnr.syncStatus}
                  </span>
                ) : null
              } />
              <InfoRow label={isAr ? 'تم الإنشاء' : 'Created'} value={new Date(pnr.createdAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')} />
              {pnr.notes && (
                <div className="pt-3">
                  <p className="text-xs text-slate-500 mb-1">{isAr ? 'ملاحظات' : 'Notes'}</p>
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">{pnr.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Passengers */}
          {tab === 'passengers' && (
            passengers.length > 0 ? (
              <div className="space-y-3">
                {passengers.map((p, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                        {(p.name || '?').charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-medium">{p.type}</span>
                      </div>
                    </div>
                    {p.passportNumber && <InfoRow label={isAr ? 'رقم الجواز' : 'Passport'} value={p.passportNumber} />}
                    {p.dateOfBirth    && <InfoRow label={isAr ? 'تاريخ الميلاد' : 'DOB'} value={p.dateOfBirth} />}
                    {p.nationality    && <InfoRow label={isAr ? 'الجنسية' : 'Nationality'} value={p.nationality} />}
                    {p.ticketNumber   && (
                      <InfoRow label={isAr ? 'رقم التذكرة' : 'Ticket'} value={
                        <span className="font-mono text-brand-700">{p.ticketNumber}</span>
                      } />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
                <Users size={28} className="text-slate-300" />
                <p className="text-sm">{isAr ? 'لا تتوفر بيانات ركاب' : 'No passenger data'}</p>
                <p className="text-xs text-center">{isAr ? 'تظهر بعد مزامنة PNR مع المزود' : 'Appears after syncing with provider'}</p>
              </div>
            )
          )}

          {/* Segments */}
          {tab === 'segments' && (
            segments.length > 0 ? (
              <div className="space-y-3">
                {segments.map((seg, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                        <Plane size={12} className="text-sky-700" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {seg.from} → {seg.to}
                        </p>
                        {(seg.carrier || seg.flightNumber) && (
                          <p className="text-xs text-slate-500">{seg.carrier} {seg.flightNumber}</p>
                        )}
                      </div>
                    </div>
                    {seg.departureAt && <InfoRow label={isAr ? 'المغادرة' : 'Departure'} value={new Date(seg.departureAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')} />}
                    {seg.arrivalAt   && <InfoRow label={isAr ? 'الوصول'    : 'Arrival'}   value={new Date(seg.arrivalAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')} />}
                    {seg.cabin       && <InfoRow label={isAr ? 'الدرجة'    : 'Cabin'}     value={seg.cabin} />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
                <Plane size={28} className="text-slate-300" />
                <p className="text-sm">{isAr ? 'لا تتوفر بيانات رحلات' : 'No segment data'}</p>
                <p className="text-xs text-center">{isAr ? 'تظهر بعد مزامنة PNR مع المزود' : 'Appears after syncing with provider'}</p>
              </div>
            )
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-mono">{pnr.id.slice(0, 16)}…</p>
          {pnr.cancelledAt && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <XCircle size={10} />
              {isAr ? 'أُلغي في' : 'Cancelled'} {new Date(pnr.cancelledAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
