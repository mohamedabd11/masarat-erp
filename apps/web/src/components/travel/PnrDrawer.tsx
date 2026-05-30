'use client';

import { useEffect } from 'react';
import {
  X, Plane, User, RefreshCw, AlertTriangle,
  CheckCircle2, Clock, Hash, Link2, FileText,
} from 'lucide-react';
import type { PnrSegmentJson, PnrPassengerJson } from '@/lib/schema/pnr';
import {
  type PnrRow,
  type ComputedStatus,
  STATUS_CONFIG,
  formatDate,
  formatDateTime,
  formatHalalas,
} from './pnr-types';

interface Props {
  pnr:            PnrRow;
  computedStatus: ComputedStatus;
  isAr:           boolean;
  onClose:        () => void;
}

function StatusBadge({ status, isAr }: { status: ComputedStatus; isAr: boolean }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
      {isAr ? cfg.labelAr : cfg.labelEn}
    </span>
  );
}

const PASSENGER_TYPE: Record<string, { ar: string; en: string }> = {
  ADT: { ar: 'بالغ',    en: 'Adult' },
  CHD: { ar: 'طفل',    en: 'Child' },
  INF: { ar: 'رضيع',   en: 'Infant' },
};

const SEGMENT_STATUS: Record<string, { ar: string; en: string; color: string }> = {
  HK: { ar: 'مؤكد',    en: 'Confirmed', color: 'text-emerald-600' },
  TK: { ar: 'مؤكد(TK)', en: 'OK (TK)',   color: 'text-emerald-600' },
  UN: { ar: 'غير مؤكد', en: 'Unconfirmed', color: 'text-orange-600' },
  NO: { ar: 'لا يوجد', en: 'No Action',  color: 'text-slate-400' },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </h3>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-800 text-end break-all">{value}</span>
    </div>
  );
}

export function PnrDrawer({ pnr, computedStatus, isAr, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const segments:  PnrSegmentJson[]   = Array.isArray(pnr.segments)  ? pnr.segments  as PnrSegmentJson[]  : [];
  const passengers: PnrPassengerJson[] = Array.isArray(pnr.passengers) ? pnr.passengers as PnrPassengerJson[] : [];

  const syncIcon =
    pnr.syncStatus === 'success'  ? <CheckCircle2 size={14} className="text-emerald-500" /> :
    pnr.syncStatus === 'failed'   ? <AlertTriangle size={14} className="text-rose-500" />   :
    pnr.syncStatus === 'pending'  ? <Clock size={14} className="text-yellow-500" />         :
    <RefreshCw size={14} className="text-slate-400" />;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-label={isAr ? `تفاصيل PNR ${pnr.pnrCode}` : `PNR ${pnr.pnrCode} details`}
        className={`fixed top-0 ${isAr ? 'left-0' : 'right-0'} z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col`}
        style={{ borderInlineStart: '1px solid #e2e8f0' }}
      >
        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-black text-lg text-slate-900 tracking-widest">
                {pnr.pnrCode}
              </span>
              <StatusBadge status={computedStatus} isAr={isAr} />
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <Plane size={12} className="text-brand-500 shrink-0" />
              {pnr.gds
                ? (isAr ? 'مزود GDS: ' : 'Provider: ') + pnr.gds.toUpperCase()
                : (isAr ? 'إدخال يدوي' : 'Manual entry')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-5 px-5 space-y-7">

          {/* ── Overview ──────────────────────────────────── */}
          <section>
            <SectionTitle>{isAr ? 'نظرة عامة' : 'Overview'}</SectionTitle>
            <div className="bg-slate-50 rounded-xl p-3 space-y-0">
              <InfoRow
                label={isAr ? 'الخط' : 'Route'}
                value={
                  <span className="font-mono font-bold text-slate-900">
                    {pnr.origin ?? segments[0]?.from ?? '—'}
                    {' → '}
                    {pnr.destination ?? segments[segments.length - 1]?.to ?? '—'}
                  </span>
                }
              />
              {pnr.departureDate && (
                <InfoRow
                  label={isAr ? 'تاريخ الذهاب' : 'Departure'}
                  value={pnr.departureDate}
                />
              )}
              {pnr.returnDate && (
                <InfoRow
                  label={isAr ? 'تاريخ العودة' : 'Return'}
                  value={pnr.returnDate}
                />
              )}
              <InfoRow
                label={isAr ? 'عدد الركاب' : 'Passengers'}
                value={pnr.passengerCount}
              />
              {pnr.totalHalalas > 0 && (
                <InfoRow
                  label={isAr ? 'الإجمالي' : 'Total'}
                  value={
                    <span className="font-semibold text-slate-900">
                      SAR {formatHalalas(pnr.totalHalalas)}
                    </span>
                  }
                />
              )}
              {pnr.fareHalalas > 0 && (
                <InfoRow
                  label={isAr ? 'السعر الأساسي' : 'Base Fare'}
                  value={`SAR ${formatHalalas(pnr.fareHalalas)}`}
                />
              )}
              {pnr.taxHalalas > 0 && (
                <InfoRow
                  label={isAr ? 'الضرائب' : 'Taxes'}
                  value={`SAR ${formatHalalas(pnr.taxHalalas)}`}
                />
              )}
              <InfoRow
                label={isAr ? 'تاريخ الإنشاء' : 'Created'}
                value={formatDateTime(pnr.createdAt, isAr)}
              />
              {pnr.expiresAt && (
                <InfoRow
                  label={isAr ? 'ينتهي في' : 'Expires'}
                  value={
                    <span className={new Date(pnr.expiresAt) < new Date() ? 'text-orange-600 font-semibold' : ''}>
                      {formatDateTime(pnr.expiresAt, isAr)}
                    </span>
                  }
                />
              )}
              {pnr.airline && (
                <InfoRow label={isAr ? 'الناقل الأساسي' : 'Carrier'} value={pnr.airline} />
              )}
            </div>
          </section>

          {/* ── Links ──────────────────────────────────────── */}
          {(pnr.customerId || pnr.bookingId) && (
            <section>
              <SectionTitle>{isAr ? 'الروابط' : 'Links'}</SectionTitle>
              <div className="bg-slate-50 rounded-xl p-3 space-y-0">
                {pnr.customerId && (
                  <InfoRow
                    label={isAr ? 'العميل' : 'Customer'}
                    value={
                      <span className="flex items-center gap-1 font-mono text-brand-600">
                        <Link2 size={11} />
                        {pnr.customerId.slice(0, 8)}…
                      </span>
                    }
                  />
                )}
                {pnr.bookingId && (
                  <InfoRow
                    label={isAr ? 'الحجز' : 'Booking'}
                    value={
                      <span className="flex items-center gap-1 font-mono text-brand-600">
                        <Link2 size={11} />
                        {pnr.bookingId.slice(0, 8)}…
                      </span>
                    }
                  />
                )}
              </div>
            </section>
          )}

          {/* ── Passengers ──────────────────────────────────── */}
          {passengers.length > 0 && (
            <section>
              <SectionTitle>
                {isAr ? `الركاب (${passengers.length})` : `Passengers (${passengers.length})`}
              </SectionTitle>
              <div className="space-y-2">
                {passengers.map((p, i) => {
                  const typeLabel = PASSENGER_TYPE[p.type];
                  return (
                    <div key={i} className="bg-slate-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <User size={13} className="text-slate-400" />
                          <span className="text-sm font-semibold text-slate-800">
                            {p.firstName} {p.lastName}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold uppercase text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">
                          {typeLabel ? (isAr ? typeLabel.ar : typeLabel.en) : p.type}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        {p.nationality && (
                          <span>{isAr ? 'الجنسية: ' : 'Nationality: '}<strong className="text-slate-700">{p.nationality}</strong></span>
                        )}
                        {p.dateOfBirth && (
                          <span>{isAr ? 'تاريخ الميلاد: ' : 'DOB: '}<strong className="text-slate-700">{p.dateOfBirth}</strong></span>
                        )}
                        {p.passportNumber && (
                          <span className="col-span-2 font-mono">
                            {isAr ? 'جواز: ' : 'Passport: '}<strong className="text-slate-700">{p.passportNumber}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Segments ────────────────────────────────────── */}
          {segments.length > 0 && (
            <section>
              <SectionTitle>
                {isAr ? `القطاعات (${segments.length})` : `Segments (${segments.length})`}
              </SectionTitle>
              <div className="space-y-2">
                {segments.map((seg, i) => {
                  const segSt = SEGMENT_STATUS[seg.status];
                  return (
                    <div key={i} className="bg-slate-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Plane size={13} className="text-brand-500" />
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {seg.carrier}{seg.flightNumber}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold ${segSt?.color ?? 'text-slate-500'}`}>
                          {seg.status}
                          {segSt && <span className="ms-1 font-normal">({isAr ? segSt.ar : segSt.en})</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm font-semibold text-slate-800 mb-2">
                        <span>{seg.from}</span>
                        <span className="text-slate-300">→</span>
                        <span>{seg.to}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        <span>{isAr ? 'مغادرة: ' : 'Dep: '}<strong className="text-slate-700 font-mono">{seg.departureDate} {seg.departureTime}</strong></span>
                        <span>{isAr ? 'وصول: ' : 'Arr: '}<strong className="text-slate-700 font-mono">{seg.arrivalDate} {seg.arrivalTime}</strong></span>
                        <span>{isAr ? 'درجة الحجز: ' : 'Class: '}<strong className="text-slate-700 font-mono">{seg.bookingClass}</strong></span>
                        <span>{isAr ? 'أساس السعر: ' : 'Fare: '}<strong className="text-slate-700 font-mono">{seg.fareBasis}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Sync Status ──────────────────────────────────── */}
          <section>
            <SectionTitle>{isAr ? 'حالة المزامنة' : 'Sync Status'}</SectionTitle>
            <div className="bg-slate-50 rounded-xl p-3 space-y-0">
              <InfoRow
                label={isAr ? 'حالة المزامنة' : 'Status'}
                value={
                  <span className="flex items-center gap-1.5">
                    {syncIcon}
                    <span className="capitalize">{pnr.syncStatus ?? (isAr ? 'غير محدد' : 'Unknown')}</span>
                  </span>
                }
              />
              <InfoRow
                label={isAr ? 'آخر مزامنة' : 'Last Synced'}
                value={formatDateTime(pnr.syncedAt, isAr)}
              />
              {pnr.syncError && (
                <InfoRow
                  label={isAr ? 'رسالة الخطأ' : 'Error'}
                  value={
                    <span className="text-rose-600 text-[10px] font-mono break-all">
                      {pnr.syncError}
                    </span>
                  }
                />
              )}
            </div>
          </section>

          {/* ── Notes ────────────────────────────────────────── */}
          {pnr.notes && (
            <section>
              <SectionTitle>{isAr ? 'ملاحظات' : 'Notes'}</SectionTitle>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex gap-2">
                  <FileText size={13} className="text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-700 leading-relaxed">{pnr.notes}</p>
                </div>
              </div>
            </section>
          )}

          {/* ── Meta ──────────────────────────────────────────── */}
          <section>
            <SectionTitle>{isAr ? 'بيانات السجل' : 'Record Meta'}</SectionTitle>
            <div className="bg-slate-50 rounded-xl p-3 space-y-0">
              <InfoRow
                label={isAr ? 'معرّف السجل' : 'Record ID'}
                value={<span className="font-mono text-[10px] text-slate-500">{pnr.id}</span>}
              />
              {pnr.createdBy && (
                <InfoRow label={isAr ? 'أنشأ بواسطة' : 'Created by'} value={
                  <span className="font-mono text-[10px]">{pnr.createdBy.slice(0, 12)}…</span>
                } />
              )}
              {pnr.cancelledAt && (
                <InfoRow label={isAr ? 'تاريخ الإلغاء' : 'Cancelled at'} value={formatDateTime(pnr.cancelledAt, isAr)} />
              )}
              {pnr.cancelledBy && (
                <InfoRow label={isAr ? 'ألغى بواسطة' : 'Cancelled by'} value={
                  <span className="font-mono text-[10px]">{pnr.cancelledBy.slice(0, 12)}…</span>
                } />
              )}
            </div>
          </section>
        </div>

        {/* ── Footer hint ───────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400 flex items-center gap-1.5">
          <Hash size={11} />
          {isAr ? 'قراءة فقط — Phase 7-A' : 'Read-only view — Phase 7-A'}
        </div>
      </aside>
    </>
  );
}
