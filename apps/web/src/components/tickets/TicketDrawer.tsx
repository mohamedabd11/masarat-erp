'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { TicketCoupon } from '@/lib/schema';
import type { TicketWithPnr } from './TicketListClient';
import {
  X, Ticket, CheckCircle2, XCircle, RefreshCw, Clock,
  AlertCircle, AlertTriangle, Plane, ClipboardList, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DrawerTab = 'overview' | 'coupons' | 'audit';

interface Props {
  ticket:   TicketWithPnr;
  isAr:     boolean;
  onClose:  () => void;
  onChange: (updated: TicketWithPnr) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0 gap-4">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-900 text-end">{value ?? '—'}</span>
    </div>
  );
}

const STATUS_META: Record<string, { ar: string; en: string; cls: string }> = {
  pending:          { ar: 'معلق',        en: 'Pending',    cls: 'bg-amber-50 text-amber-700' },
  active:           { ar: 'نشط',         en: 'Active',     cls: 'bg-emerald-50 text-emerald-700' },
  pending_void:     { ar: 'إلغاء جارٍ',  en: 'Voiding',    cls: 'bg-orange-50 text-orange-700' },
  void:             { ar: 'مُلغى',       en: 'Void',       cls: 'bg-red-50 text-red-600' },
  pending_refund:   { ar: 'استرداد جارٍ', en: 'Refunding', cls: 'bg-purple-50 text-purple-600' },
  refunded:         { ar: 'مُسترد',      en: 'Refunded',   cls: 'bg-purple-50 text-purple-700' },
  pending_exchange: { ar: 'تبادل جارٍ',  en: 'Exchanging', cls: 'bg-blue-50 text-blue-700' },
  exchanged:        { ar: 'مُبادَل',     en: 'Exchanged',  cls: 'bg-sky-50 text-sky-700' },
};

const COUPON_META: Record<string, { ar: string; en: string; cls: string }> = {
  open:     { ar: 'مفتوح',   en: 'Open',     cls: 'bg-emerald-50 text-emerald-700' },
  used:     { ar: 'مُستخدم', en: 'Used',     cls: 'bg-slate-100 text-slate-600' },
  void:     { ar: 'مُلغى',   en: 'Void',     cls: 'bg-red-50 text-red-600' },
  refunded: { ar: 'مُسترد',  en: 'Refunded', cls: 'bg-purple-50 text-purple-700' },
};

function StatusChip({ status, isAr }: { status: string; isAr: boolean }) {
  const m = STATUS_META[status] ?? { ar: status, en: status, cls: 'bg-slate-100 text-slate-500' };
  return <span className={cn('text-[11px] font-semibold px-2 py-1 rounded-md', m.cls)}>{isAr ? m.ar : m.en}</span>;
}

// ─── Main drawer ─────────────────────────────────────────────────────────────

export function TicketDrawer({ ticket, isAr, onClose, onChange }: Props) {
  const [tab,     setTab]     = useState<DrawerTab>('overview');
  const [coupons, setCoupons] = useState<TicketCoupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponError,    setCouponError]    = useState('');

  const isOrphan = ticket.reconciliationAttempts >= 20 &&
    new Set(['pending', 'pending_void', 'pending_refund', 'pending_exchange']).has(ticket.status);

  function formatAmount(h: number) {
    return (h / 100).toLocaleString(isAr ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2 });
  }

  // Load coupons when coupons tab is first opened
  useEffect(() => {
    if (tab !== 'coupons' || coupons.length > 0 || loadingCoupons) return;
    setLoadingCoupons(true);
    setCouponError('');
    apiFetch<{ ticket: TicketWithPnr; coupons: TicketCoupon[] }>(`/api/tickets/${ticket.id}`)
      .then(data => {
        setCoupons(data.coupons);
        // Update the ticket in the parent list if it changed
        onChange({ ...data.ticket, pnrCode: ticket.pnrCode });
      })
      .catch(e => setCouponError((e as Error).message))
      .finally(() => setLoadingCoupons(false));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { id: DrawerTab; ar: string; en: string; icon: React.ReactNode }[] = [
    { id: 'overview', ar: 'نظرة عامة', en: 'Overview', icon: <FileText size={14} /> },
    { id: 'coupons',  ar: 'الكوبونات', en: 'Coupons',  icon: <Plane size={14} /> },
    { id: 'audit',    ar: 'السجل',     en: 'Audit',    icon: <ClipboardList size={14} /> },
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
            <div className="flex items-center gap-2">
              <Ticket size={16} className="text-brand-600" />
              <p className="font-mono font-bold text-slate-900 text-base">
                {ticket.ticketNumber ?? (isAr ? 'رقم التذكرة غير معيّن' : 'Ticket # pending')}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StatusChip status={ticket.status} isAr={isAr} />
              {isOrphan && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200">
                  <AlertCircle size={8} />
                  {isAr ? 'يتيم' : 'Orphan'}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Orphan warning */}
        {isOrphan && (
          <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-start gap-2 text-xs text-red-700">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              {isAr
                ? `بلغت محاولات المصالحة ${ticket.reconciliationAttempts} مرة — هذه التذكرة تحتاج مراجعة يدوية.`
                : `Reconciliation failed after ${ticket.reconciliationAttempts} attempts — manual review required.`}
            </span>
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
              <InfoRow
                label={isAr ? 'رقم التذكرة' : 'Ticket Number'}
                value={ticket.ticketNumber
                  ? <span className="font-mono text-brand-700">{ticket.ticketNumber}</span>
                  : <span className="text-slate-400 italic text-[11px]">{isAr ? 'في الانتظار...' : 'pending...'}</span>}
              />
              <InfoRow label={isAr ? 'كود PNR' : 'PNR Code'} value={
                ticket.pnrCode
                  ? <span className="font-mono text-slate-900">{ticket.pnrCode}</span>
                  : null
              } />
              <InfoRow label={isAr ? 'الراكب' : 'Passenger'} value={ticket.passengerName} />
              <InfoRow label={isAr ? 'المزود' : 'Provider'} value={
                ticket.issuingProvider
                  ? <span className="uppercase font-semibold">{ticket.issuingProvider}</span>
                  : null
              } />
              <InfoRow label={isAr ? 'سعر التذكرة' : 'Fare'} value={
                ticket.fareHalalas > 0 ? `${formatAmount(ticket.fareHalalas)} ر.س` : null
              } />
              <InfoRow label={isAr ? 'الضرائب' : 'Tax'} value={
                ticket.taxHalalas > 0 ? `${formatAmount(ticket.taxHalalas)} ر.س` : null
              } />
              <InfoRow label={isAr ? 'الإجمالي' : 'Total'} value={
                <span className="font-semibold text-slate-900">
                  {formatAmount(ticket.totalHalalas)} {isAr ? 'ر.س' : 'SAR'}
                </span>
              } />
              <InfoRow label={isAr ? 'الحالة' : 'Status'} value={<StatusChip status={ticket.status} isAr={isAr} />} />
              {ticket.customerId && <InfoRow label={isAr ? 'رقم العميل' : 'Customer ID'} value={ticket.customerId} />}
              {ticket.bookingId && <InfoRow label={isAr ? 'رقم الحجز' : 'Booking ID'} value={ticket.bookingId} />}
              <InfoRow label={isAr ? 'تم الإنشاء' : 'Created'} value={
                new Date(ticket.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')
              } />
            </div>
          )}

          {/* Coupons */}
          {tab === 'coupons' && (
            loadingCoupons ? (
              <div className="py-12 flex justify-center"><Spinner size="sm" /></div>
            ) : couponError ? (
              <div className="py-10 flex flex-col items-center gap-2 text-sm text-red-600">
                <AlertTriangle size={20} />
                {couponError}
              </div>
            ) : coupons.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
                <Plane size={28} className="text-slate-300" />
                <p className="text-sm">{isAr ? 'لا توجد كوبونات' : 'No coupons'}</p>
                <p className="text-xs text-center">
                  {isAr ? 'تُنشأ الكوبونات عند اكتمال إصدار التذكرة' : 'Coupons are created when ticket issuance completes'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {coupons.map((c, i) => {
                  const cm = COUPON_META[c.couponStatus] ?? { ar: c.couponStatus, en: c.couponStatus, cls: 'bg-slate-100 text-slate-500' };
                  return (
                    <div key={c.id} className="p-3 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0">
                            <Plane size={12} className="text-sky-600" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              {isAr ? `قطعة ${c.segmentIndex + 1}` : `Segment ${c.segmentIndex + 1}`}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {isAr ? 'فهرس الرحلة:' : 'Segment index:'} {c.segmentIndex}
                            </p>
                          </div>
                        </div>
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', cm.cls)}>
                          {isAr ? cm.ar : cm.en}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400">
                          {isAr ? 'آخر تحديث:' : 'Updated:'} {new Date(c.updatedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Audit */}
          {tab === 'audit' && (
            <div className="space-y-1">
              <InfoRow label={isAr ? 'تاريخ الإصدار' : 'Issued At'} value={
                ticket.issuedAt
                  ? <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={11} />{new Date(ticket.issuedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}</span>
                  : <span className="text-slate-400 italic text-[11px]">{isAr ? 'لم يُصدر بعد' : 'Not yet issued'}</span>
              } />
              <InfoRow label={isAr ? 'صدر بواسطة' : 'Issued By'} value={ticket.issuedBy ?? null} />
              <InfoRow label={isAr ? 'تاريخ الإلغاء' : 'Voided At'} value={
                ticket.voidedAt
                  ? <span className="flex items-center gap-1 text-red-600"><XCircle size={11} />{new Date(ticket.voidedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}</span>
                  : null
              } />
              {ticket.voidedBy && <InfoRow label={isAr ? 'أُلغي بواسطة' : 'Voided By'} value={ticket.voidedBy} />}
              <InfoRow label={isAr ? 'تاريخ الاسترداد' : 'Refunded At'} value={
                ticket.refundedAt
                  ? <span className="flex items-center gap-1 text-purple-700"><RefreshCw size={11} />{new Date(ticket.refundedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}</span>
                  : null
              } />
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">{isAr ? 'إحصائيات المصالحة' : 'Reconciliation Stats'}</p>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'flex-1 p-2.5 rounded-xl text-center border',
                    isOrphan ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200',
                  )}>
                    <p className={cn('text-2xl font-bold', isOrphan ? 'text-red-600' : 'text-slate-700')}>
                      {ticket.reconciliationAttempts}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'محاولة' : 'attempts'}</p>
                  </div>
                  <div className="flex-1 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <p className="text-xs font-medium text-slate-700">
                      {ticket.lastReconciliationAt
                        ? new Date(ticket.lastReconciliationAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')
                        : '—'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'آخر محاولة' : 'last attempt'}</p>
                  </div>
                </div>
                {isOrphan && (
                  <p className="mt-2 text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    {isAr
                      ? 'تجاوزت عدد محاولات المصالحة الحد الأقصى (20). يلزم تدخل يدوي.'
                      : 'Reconciliation exceeded 20 attempts. Manual intervention required.'}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-mono">{ticket.id.slice(0, 16)}…</p>
          <p className="text-[10px] text-slate-400">
            {isAr ? 'آخر تحديث:' : 'Updated:'} {new Date(ticket.updatedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
          </p>
        </div>
      </div>
    </>
  );
}
