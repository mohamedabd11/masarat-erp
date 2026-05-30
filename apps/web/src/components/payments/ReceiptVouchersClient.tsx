'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  TrendingUp, Search, X, Banknote, CreditCard,
  Building2, Globe, Printer, Receipt, Plus, RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { ReceiptVoucherModal } from './ReceiptVoucherModal';
import { ProcessRefundModal } from '@/components/bookings/ProcessRefundModal';
import { apiFetch } from '@/lib/api-client';

// ─── Unified row type ─────────────────────────────────────────────────────────
interface VoucherRow {
  id:             string;
  kind:           'payment' | 'receipt';   // payment = linked to invoice, receipt = standalone
  voucherNumber:  string;
  date:           string | null;
  customerName:   string;
  method:         string;
  amountHalalas:  number;
  invoiceNumber?: string;
  invoiceId?:     string;
  bookingId?:     string;
  isRefund:       boolean;
}

type MethodFilter = 'all' | 'cash' | 'bank_transfer' | 'card' | 'online';

function methodIcon(method: string) {
  if (method === 'bank_transfer') return <Building2 size={13} />;
  if (method === 'card')          return <CreditCard size={13} />;
  if (method === 'online')        return <Globe size={13} />;
  return <Banknote size={13} />;
}

function methodLabel(method: string, isAr: boolean) {
  const map: Record<string, { ar: string; en: string }> = {
    cash:          { ar: 'نقداً',         en: 'Cash' },
    bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
    card:          { ar: 'بطاقة',         en: 'Card' },
    online:        { ar: 'دفع إلكتروني', en: 'Online' },
  };
  const m = map[method];
  return m ? (isAr ? m.ar : m.en) : method;
}

// ─── Reverse standalone receipt modal ────────────────────────────────────────
function ReverseReceiptModal({
  receipt, onClose, onSuccess, isAr,
}: { receipt: VoucherRow; onClose: () => void; onSuccess: () => void; isAr: boolean }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleReverse() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/receipts/${receipt.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ غير معروف');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {isAr ? 'عكس سند القبض' : 'Reverse Receipt'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? `سيتم عكس سند القبض ${receipt.voucherNumber} وإنشاء قيد محاسبي معكوس.`
              : `Receipt ${receipt.voucherNumber} will be reversed with a matching journal entry.`}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {isAr ? 'سبب العكس (اختياري)' : 'Reason (optional)'}
          </label>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder={isAr ? 'مثال: خطأ في الإدخال' : 'e.g. Data entry error'}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={handleReverse} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? '...' : isAr ? 'تأكيد العكس' : 'Confirm Reverse'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ReceiptVouchersClient() {
  const locale    = useLocale();
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();
  const agencyId  = (user?.agencyId as string | undefined) ?? null;

  const [rows,        setRows]       = useState<VoucherRow[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [search,      setSearch]     = useState('');
  const [method,      setMethod]     = useState<MethodFilter>('all');
  const [showModal,   setShowModal]  = useState(false);
  const [showRefund,  setShowRefund] = useState<VoucherRow | null>(null);
  const [showReverse, setShowReverse] = useState<VoucherRow | null>(null);
  const [refreshKey,  setRefreshKey] = useState(0);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch<{ payments: Array<{
        id: string; invoiceId?: string; invoiceNumber?: string;
        bookingId?: string; customerNameAr?: string; customerNameEn?: string;
        amountHalalas: number; paymentMethod: string; receiptNumber?: string;
        createdAt: string | null;
      }> }>('/api/payments'),
      apiFetch<{ receipts: Array<{
        id: string; voucherNumber: string; customerName?: string;
        amountHalalas: number; method: string; date: string;
        isRefund?: string; createdAt: string | null;
      }> }>('/api/receipts'),
    ]).then(([pmtData, rctData]) => {
      if (cancelled) return;

      const paymentRows: VoucherRow[] = pmtData.payments.map(p => ({
        id:            p.id,
        kind:          'payment',
        voucherNumber: p.receiptNumber ?? p.id.slice(-8).toUpperCase(),
        date:          p.createdAt,
        customerName:  isAr
          ? (p.customerNameAr || p.customerNameEn || '—')
          : (p.customerNameEn || p.customerNameAr || '—'),
        method:        p.paymentMethod,
        amountHalalas: p.amountHalalas,
        invoiceNumber: p.invoiceNumber,
        invoiceId:     p.invoiceId,
        bookingId:     p.bookingId,
        isRefund:      false,
      }));

      const receiptRows: VoucherRow[] = rctData.receipts.map(r => ({
        id:            r.id,
        kind:          'receipt',
        voucherNumber: r.voucherNumber,
        date:          r.createdAt ?? r.date,
        customerName:  r.customerName ?? '—',
        method:        r.method,
        amountHalalas: r.amountHalalas,
        isRefund:      r.isRefund === 'true',
      }));

      const all = [...paymentRows, ...receiptRows].sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      });

      setRows(all);
    })
    .catch(() => {})
    .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId, isAr, showModal, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (method !== 'all' && r.method !== method) return false;
      if (!q) return true;
      return r.customerName.toLowerCase().includes(q)
          || r.voucherNumber.toLowerCase().includes(q)
          || (r.invoiceNumber ?? '').toLowerCase().includes(q);
    });
  }, [rows, search, method]);

  const totalHalalas = filtered.filter(r => !r.isRefund).reduce((s, r) => s + r.amountHalalas, 0);
  const refundHalalas = filtered.filter(r => r.isRefund).reduce((s, r) => s + r.amountHalalas, 0);

  const methodFilters: { key: MethodFilter; ar: string; en: string }[] = [
    { key: 'all',          ar: 'الكل',        en: 'All' },
    { key: 'cash',         ar: 'نقداً',       en: 'Cash' },
    { key: 'bank_transfer',ar: 'تحويل بنكي', en: 'Bank Transfer' },
    { key: 'card',         ar: 'بطاقة',       en: 'Card' },
    { key: 'online',       ar: 'إلكتروني',   en: 'Online' },
  ];

  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex-shrink-0">
            <TrendingUp size={24} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isAr ? 'سندات القبض' : 'Receipt Vouchers'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {isAr
                ? 'جميع المبالغ المستلمة من العملاء — سندات القبض الرسمية'
                : 'All amounts received from customers — official receipt vouchers'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!loading && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-end">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                {isAr ? 'صافي المحصّل' : 'Net Collected'}
              </p>
              <p className="text-lg font-extrabold text-emerald-700 tabular-nums">
                {formatCurrency(totalHalalas - refundHalalas, fmtLocale)}
              </p>
            </div>
          )}
          <Button size="sm" onClick={() => setShowModal(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus size={14} />
            {isAr ? 'سند قبض جديد' : 'New Receipt'}
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: isAr ? 'إجمالي المحصّل' : 'Total Received',
            value: formatCurrency(rows.filter(r => !r.isRefund).reduce((s, r) => s + r.amountHalalas, 0), fmtLocale),
            color: 'border-emerald-500', textColor: 'text-emerald-700',
          },
          {
            label: isAr ? 'إجمالي المردودات' : 'Total Refunds',
            value: formatCurrency(rows.filter(r => r.isRefund).reduce((s, r) => s + r.amountHalalas, 0), fmtLocale),
            color: 'border-red-400', textColor: 'text-red-600',
          },
          {
            label: isAr ? 'عدد السندات' : 'Total Vouchers',
            value: rows.filter(r => !r.isRefund).length.toLocaleString(fmtLocale),
            color: 'border-brand-500', textColor: 'text-brand-700',
          },
          {
            label: isAr ? 'سندات القبض المستقلة' : 'Standalone Receipts',
            value: rows.filter(r => r.kind === 'receipt' && !r.isRefund).length.toLocaleString(fmtLocale),
            color: 'border-amber-400', textColor: 'text-amber-700',
          },
        ].map(k => (
          <div key={k.label} className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-s-4', k.color)}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{k.label}</p>
            <p className={cn('text-xl font-extrabold tabular-nums', k.textColor)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالعميل أو رقم السند...' : 'Search customer or voucher no...'}
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
          <Receipt size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">
            {search || method !== 'all'
              ? (isAr ? 'لا توجد نتائج' : 'No results')
              : (isAr ? 'لا توجد سندات قبض بعد' : 'No receipt vouchers yet')}
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-start ps-5 pe-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'التاريخ' : 'Date'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'رقم السند' : 'Voucher #'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'العميل' : 'Customer'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'الفاتورة' : 'Invoice'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'طريقة الدفع' : 'Method'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'المبلغ' : 'Amount'}
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'إجراء' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => {
                  const date = r.date ? new Date(r.date) : null;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'hover:bg-slate-50/60 transition-colors',
                        r.isRefund && 'opacity-60 bg-red-50/30',
                      )}
                    >
                      <td className="ps-5 pe-3 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                        {date ? formatDate(date, fmtLocale) : '—'}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {r.voucherNumber}
                          </span>
                          {r.isRefund && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                              {isAr ? 'عكس' : 'REV'}
                            </span>
                          )}
                          {r.kind === 'receipt' && !r.isRefund && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              {isAr ? 'مستقل' : 'RCPT'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-sm font-medium text-slate-900">{r.customerName}</p>
                      </td>
                      <td className="px-3 py-3.5 hidden md:table-cell">
                        <span className="text-xs font-mono text-brand-700">
                          {r.invoiceNumber ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                          {methodIcon(r.method)}
                          {methodLabel(r.method, isAr)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end">
                        <span className={cn(
                          'text-sm font-bold font-mono tabular-nums',
                          r.isRefund ? 'text-red-600' : 'text-emerald-700',
                        )}>
                          {r.isRefund ? '−' : ''}{formatCurrency(r.amountHalalas, fmtLocale)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* Print */}
                          <Link
                            href={`/${locale}/payments/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                          >
                            <Printer size={13} />
                            {isAr ? 'طباعة' : 'Print'}
                          </Link>

                          {/* Refund (booking-linked payment) */}
                          {!r.isRefund && r.kind === 'payment' && r.invoiceId && r.bookingId && (
                            <button
                              onClick={() => setShowRefund(r)}
                              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                            >
                              <RotateCcw size={13} />
                              {isAr ? 'استرداد' : 'Refund'}
                            </button>
                          )}

                          {/* Reverse (standalone receipt) */}
                          {!r.isRefund && r.kind === 'receipt' && (
                            <button
                              onClick={() => setShowReverse(r)}
                              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                            >
                              <RotateCcw size={13} />
                              {isAr ? 'عكس' : 'Reverse'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={5} className="ps-5 pe-3 py-3.5">
                    <span className="text-sm font-bold text-slate-700">
                      {isAr
                        ? `الإجمالي (${filtered.filter(r => !r.isRefund).length} سند)`
                        : `Total (${filtered.filter(r => !r.isRefund).length} vouchers)`}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-end">
                    <span className="text-sm font-black font-mono tabular-nums text-emerald-700">
                      {formatCurrency(totalHalalas, fmtLocale)}
                    </span>
                  </td>
                  <td className="px-3 py-3.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showModal && agencyId && (
        <ReceiptVoucherModal
          agencyId={agencyId}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); refresh(); }}
        />
      )}

      {showRefund && agencyId && showRefund.invoiceId && showRefund.bookingId && (
        <ProcessRefundModal
          bookingId={showRefund.bookingId}
          invoiceId={showRefund.invoiceId}
          agencyId={agencyId}
          paidAmountHalalas={showRefund.amountHalalas}
          onClose={() => setShowRefund(null)}
          onSuccess={() => { setShowRefund(null); refresh(); }}
        />
      )}

      {showReverse && (
        <ReverseReceiptModal
          receipt={showReverse}
          isAr={isAr}
          onClose={() => setShowReverse(null)}
          onSuccess={() => { setShowReverse(null); refresh(); }}
        />
      )}
    </div>
  );
}
