'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  ArrowUpRight, Search, X, Banknote, CreditCard,
  Building2, Globe, FileCheck2, CheckCircle2, TrendingDown, Plus, RotateCcw,
  AlertTriangle, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { SupplierPaymentModal } from '@/components/bookings/SupplierPaymentModal';
import { UpgradeGate } from '@/components/ui/UpgradeGate';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierPayment {
  id: string;
  agencyId: string;
  bookingId?: string;
  bookingNumber?: string;
  payeeName?: string;
  supplierName?: string;
  expenseCategory?: string;
  amountHalalas: number;
  paymentMethod: string;
  method?: string;
  reference?: string;
  notes?: string;
  status: string;
  createdAt: { toDate?: () => Date } | string | null;
  date?: string;
}

type MethodFilter = 'all' | 'cash' | 'bank_transfer' | 'card' | 'online' | 'check';

// ─── SupplierPaymentRefundModal ───────────────────────────────────────────────

interface RefundModalProps {
  payment: SupplierPayment;
  onClose: () => void;
  onSuccess: () => void;
}

function SupplierPaymentRefundModal({ payment, onClose, onSuccess }: RefundModalProps) {
  const locale = useLocale();
  const isAr   = locale === 'ar';
  const [reason,   setReason]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const name = payment.payeeName ?? payment.supplierName ?? '—';

  async function handleConfirm() {
    if (!confirmed) { setConfirmed(true); return; }
    setSaving(true);
    setError('');
    try {
      const { getAuth } = await import('firebase/auth');
      const { getApp } = await import('@masarat/firebase');
      const token = await getAuth(getApp()).currentUser?.getIdToken();

      const res = await fetch('/api/supplier-payments/reverse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ supplierPaymentId: payment.id, reason }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? (isAr ? 'حدث خطأ' : 'Error'));
      }

      setSuccess(true);
      onSuccess();
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'Error'));
      setConfirmed(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RotateCcw size={18} className="text-red-500" />
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'تأكيد الاسترداد' : 'Confirm Reversal'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="font-semibold text-slate-900">{isAr ? 'تم الاسترداد بنجاح' : 'Reversal completed'}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <AlertTriangle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                {isAr
                  ? 'سيتم عكس هذا الصرف وإنشاء قيد محاسبي معاكس.'
                  : 'This payment will be reversed with a counter journal entry.'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 mb-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{isAr ? 'صُرف لـ' : 'Payee'}</span>
                <span className="font-semibold text-slate-900">{name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{isAr ? 'المبلغ' : 'Amount'}</span>
                <span className="font-bold text-red-600 tabular-nums">{formatCurrency(payment.amountHalalas, fmtLocale)}</span>
              </div>
            </div>

            <div className="mb-4 space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                {isAr ? 'سبب الاسترداد' : 'Reason'}
                <span className="text-slate-400 ms-1 text-xs">{isAr ? '(اختياري)' : '(optional)'}</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={isAr ? 'سبب الاسترداد...' : 'Reason for reversal...'}
                className="w-full rounded-lg border border-slate-300 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {confirmed && !error && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 mb-4">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                {isAr ? 'اضغط مرة أخرى لتأكيد الاسترداد النهائي' : 'Press again to confirm final reversal'}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {isAr ? 'تأكيد الاسترداد' : 'Confirm Reversal'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function methodIcon(method: string) {
  if (method === 'bank_transfer') return <Building2 size={13} />;
  if (method === 'card')          return <CreditCard size={13} />;
  if (method === 'online')        return <Globe size={13} />;
  if (method === 'check')         return <FileCheck2 size={13} />;
  return <Banknote size={13} />;
}

function methodLabel(method: string, isAr: boolean) {
  const map: Record<string, { ar: string; en: string }> = {
    cash:          { ar: 'نقداً',        en: 'Cash' },
    bank_transfer: { ar: 'تحويل بنكي',  en: 'Bank Transfer' },
    card:          { ar: 'بطاقة',        en: 'Card' },
    online:        { ar: 'دفع إلكتروني', en: 'Online' },
    check:         { ar: 'شيك',          en: 'Cheque' },
  };
  const m = map[method];
  return m ? (isAr ? m.ar : m.en) : method;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierPaymentsPage() {
  const locale    = useLocale();
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();
  const agencyId  = (user?.agencyId as string | undefined) ?? null;

  const [payments,    setPayments]    = useState<SupplierPayment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [method,      setMethod]      = useState<MethodFilter>('all');
  const [showModal,   setShowModal]   = useState(false);
  const [showRefund,  setShowRefund]  = useState<SupplierPayment | null>(null);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const data = await apiFetch<{ payments: SupplierPayment[] }>('/api/supplier-payments');

        if (cancelled) return;
        const docs = data.payments
          .map(p => ({
            ...p,
            // normalize method → paymentMethod for UI compatibility
            paymentMethod: p.method ?? p.paymentMethod ?? 'cash',
          }))
          .sort((a, b) => {
            const ta = a.date ? new Date(a.date).getTime() : 0;
            const tb = b.date ? new Date(b.date).getTime() : 0;
            return tb - ta;
          });
        setPayments(docs);
      } catch (err) {
        console.error('[supplier-payments]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId, showModal, showRefund]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter(p => {
      if (method !== 'all' && p.paymentMethod !== method) return false;
      if (!q) return true;
      const name = (p.payeeName ?? p.supplierName ?? '').toLowerCase();
      return (
        name.includes(q) ||
        (p.bookingNumber ?? '').toLowerCase().includes(q) ||
        (p.reference ?? '').toLowerCase().includes(q)
      );
    });
  }, [payments, search, method]);

  const totalHalalas = filtered.reduce((s, p) => s + p.amountHalalas, 0);

  const methodFilters: { key: MethodFilter; ar: string; en: string }[] = [
    { key: 'all',          ar: 'الكل',        en: 'All' },
    { key: 'cash',         ar: 'نقداً',       en: 'Cash' },
    { key: 'bank_transfer',ar: 'تحويل بنكي', en: 'Bank Transfer' },
    { key: 'card',         ar: 'بطاقة',       en: 'Card' },
    { key: 'check',        ar: 'شيك',         en: 'Cheque' },
  ];

  return (
    <UpgradeGate feature="supplier_payments">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="p-3 bg-red-50 rounded-2xl border border-red-100 flex-shrink-0">
            <TrendingDown size={24} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isAr ? 'سندات الصرف' : 'Payment Vouchers'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {isAr
                ? 'جميع المبالغ المصروفة — للموردين وغيرهم'
                : 'All payment vouchers — suppliers and other expenses'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Summary chip */}
          {!loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-end">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                {isAr ? 'إجمالي المعروض' : 'Showing Total'}
              </p>
              <p className="text-lg font-extrabold text-red-700 tabular-nums">
                {formatCurrency(totalHalalas, fmtLocale)}
              </p>
            </div>
          )}
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            {isAr ? 'سند صرف جديد' : 'New Voucher'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالجهة أو رقم الحجز...' : 'Search payee or booking number...'}
            className="w-full ps-9 pe-9 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1 flex-wrap">
          {methodFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setMethod(f.key)}
              className={cn(
                'px-3 py-2 rounded-xl text-xs font-semibold transition-colors',
                method === f.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {isAr ? f.ar : f.en}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <TrendingDown size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">
            {search || method !== 'all'
              ? (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results')
              : (isAr ? 'لا توجد سندات صرف بعد' : 'No supplier payments yet')}
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-surface-border">
                  <th className="text-start ps-5 pe-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'التاريخ' : 'Date'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'صُرف لـ' : 'Paid To'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'رقم الحجز' : 'Booking #'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'طريقة الدفع' : 'Method'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'المبلغ' : 'Amount'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'سند' : 'Voucher'}
                  </th>
                  <th className="text-end pe-5 px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'استرداد' : 'Refund'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(p => {
                  const date = p.date ? new Date(p.date) : (typeof p.createdAt === 'string' ? new Date(p.createdAt) : (p.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? null);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="ps-5 pe-3 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                        {date ? formatDate(date, fmtLocale) : '—'}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-sm font-medium text-slate-900">{p.payeeName ?? p.supplierName ?? '—'}</p>
                        {p.reference && (
                          <p className="text-xs text-slate-400 mt-0.5">{p.reference}</p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 hidden md:table-cell">
                        {p.bookingNumber ? (
                          <Link
                            href={`/${locale}/bookings/${p.bookingId}`}
                            className="text-xs font-mono text-brand-600 hover:text-brand-700 hover:underline"
                          >
                            {p.bookingNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                          {methodIcon(p.paymentMethod)}
                          {methodLabel(p.paymentMethod, isAr)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end">
                        <span className="text-sm font-bold font-mono tabular-nums text-red-600">
                          {formatCurrency(p.amountHalalas, fmtLocale)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end">
                        <Link
                          href={`/${locale}/supplier-payments/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          <CheckCircle2 size={13} />
                          {isAr ? 'عرض' : 'View'}
                          <ArrowUpRight size={12} />
                        </Link>
                      </td>
                      <td className="pe-5 px-3 py-3.5 text-end">
                        {p.status !== 'reversed' && p.status !== 'reversal' && (
                          <button
                            onClick={() => setShowRefund(p)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                          >
                            <RotateCcw size={13} />
                            {isAr ? 'استرداد' : 'Refund'}
                          </button>
                        )}
                        {(p.status === 'reversed') && (
                          <span className="text-xs text-slate-400">{isAr ? '(مُسترد)' : '(reversed)'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={4} className="ps-5 pe-3 py-3.5">
                    <span className="text-sm font-bold text-slate-700">
                      {isAr ? `الإجمالي (${filtered.length} سند)` : `Total (${filtered.length} payments)`}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-end">
                    <span className="text-sm font-black font-mono tabular-nums text-red-700">
                      {formatCurrency(totalHalalas, fmtLocale)}
                    </span>
                  </td>
                  <td className="px-3 py-3.5" />
                  <td className="pe-5 px-3 py-3.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
      {showModal && agencyId && (
        <SupplierPaymentModal
          agencyId={agencyId}
          onClose={() => setShowModal(false)}
        />
      )}

      {showRefund && agencyId && (
        <SupplierPaymentRefundModal
          payment={showRefund}
          onClose={() => setShowRefund(null)}
          onSuccess={() => setShowRefund(null)}
        />
      )}
    </div>
    </UpgradeGate>
  );
}
