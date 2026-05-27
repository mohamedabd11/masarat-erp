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

interface ReceiptPayment {
  id: string;
  agencyId: string;
  bookingId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerNameAr?: string;
  customerNameEn?: string;
  amountHalalas: number;
  paymentMethod: string;
  reference?: string;
  receiptNumber?: string;
  createdAt: { toDate?: () => Date } | null;
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

export function ReceiptVouchersClient() {
  const locale    = useLocale();
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();
  const agencyId  = (user?.agencyId as string | undefined) ?? null;

  const [payments,    setPayments]   = useState<ReceiptPayment[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [search,      setSearch]     = useState('');
  const [method,      setMethod]     = useState<MethodFilter>('all');
  const [showModal,   setShowModal]  = useState(false);
  const [showRefund,  setShowRefund] = useState<ReceiptPayment | null>(null);
  const [refreshKey,  setRefreshKey] = useState(0);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const { getFirestore, collection, query, where, getDocs } =
          await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        const q = query(
          collection(db, 'payments'),
          where('agencyId', '==', agencyId),
        );

        const snap = await getDocs(q);
        if (cancelled) return;

        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as ReceiptPayment))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
            const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
            return bTime - aTime;
          });

        setPayments(docs);
      } catch {
        // silently handle permission errors on empty collection
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId, showModal, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter(p => {
      if (method !== 'all' && p.paymentMethod !== method) return false;
      if (!q) return true;
      const nameAr = (p.customerNameAr ?? '').toLowerCase();
      const nameEn = (p.customerNameEn ?? '').toLowerCase();
      const inv    = (p.invoiceNumber ?? '').toLowerCase();
      const rcpt   = (p.receiptNumber ?? '').toLowerCase();
      return nameAr.includes(q) || nameEn.includes(q) || inv.includes(q) || rcpt.includes(q);
    });
  }, [payments, search, method]);

  const totalHalalas = filtered.reduce((s, p) => s + p.amountHalalas, 0);

  const methodFilters: { key: MethodFilter; ar: string; en: string }[] = [
    { key: 'all',          ar: 'الكل',        en: 'All' },
    { key: 'cash',         ar: 'نقداً',       en: 'Cash' },
    { key: 'bank_transfer',ar: 'تحويل بنكي', en: 'Bank Transfer' },
    { key: 'card',         ar: 'بطاقة',       en: 'Card' },
    { key: 'online',       ar: 'إلكتروني',   en: 'Online' },
  ];

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
                {isAr ? 'إجمالي المعروض' : 'Showing Total'}
              </p>
              <p className="text-lg font-extrabold text-emerald-700 tabular-nums">
                {formatCurrency(totalHalalas, fmtLocale)}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          {
            label: isAr ? 'إجمالي المحصّل' : 'Total Collected',
            value: formatCurrency(payments.reduce((s, p) => s + p.amountHalalas, 0), fmtLocale),
            color: 'border-emerald-500',
            bg: 'bg-emerald-50',
            textColor: 'text-emerald-700',
          },
          {
            label: isAr ? 'عدد السندات' : 'Total Vouchers',
            value: payments.length.toLocaleString(fmtLocale),
            color: 'border-brand-500',
            bg: 'bg-brand-50',
            textColor: 'text-brand-700',
          },
          {
            label: isAr ? 'متوسط الدفعة' : 'Avg. Payment',
            value: payments.length > 0
              ? formatCurrency(Math.round(payments.reduce((s, p) => s + p.amountHalalas, 0) / payments.length), fmtLocale)
              : formatCurrency(0, fmtLocale),
            color: 'border-amber-500',
            bg: 'bg-amber-50',
            textColor: 'text-amber-700',
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
            placeholder={isAr ? 'بحث بالعميل أو رقم الفاتورة أو السند...' : 'Search customer, invoice or receipt no...'}
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
              ? (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results')
              : (isAr ? 'لا توجد سندات قبض بعد' : 'No receipt vouchers yet')}
          </p>
          {!search && method === 'all' && (
            <p className="text-slate-300 text-xs mt-1">
              {isAr
                ? 'ستظهر هنا سندات القبض بعد تسجيل دفعات من العملاء'
                : 'Receipt vouchers will appear here after recording customer payments'}
            </p>
          )}
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
                  <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'رقم السند' : 'Receipt #'}
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
                  <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'سند القبض' : 'Voucher'}
                  </th>
                  <th className="text-end pe-5 px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'استرداد' : 'Refund'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(p => {
                  const date        = p.createdAt?.toDate?.() ?? null;
                  const customerName = isAr
                    ? (p.customerNameAr || p.customerNameEn || '—')
                    : (p.customerNameEn || p.customerNameAr || '—');
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="ps-5 pe-3 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                        {date ? formatDate(date, fmtLocale) : '—'}
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <span className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {p.receiptNumber ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-sm font-medium text-slate-900">{customerName}</p>
                      </td>
                      <td className="px-3 py-3.5 hidden md:table-cell">
                        <span className="text-xs font-mono text-brand-700">
                          {p.invoiceNumber ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                          {methodIcon(p.paymentMethod)}
                          {methodLabel(p.paymentMethod, isAr)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end">
                        <span className="text-sm font-bold font-mono tabular-nums text-emerald-700">
                          {formatCurrency(p.amountHalalas, fmtLocale)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-end">
                        <Link
                          href={`/${locale}/payments/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          <Printer size={13} />
                          {isAr ? 'طباعة' : 'Print'}
                        </Link>
                      </td>
                      <td className="pe-5 px-3 py-3.5 text-end">
                        {p.invoiceId && p.bookingId && (
                          <button
                            onClick={() => setShowRefund(p)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                          >
                            <RotateCcw size={13} />
                            {isAr ? 'استرداد' : 'Refund'}
                          </button>
                        )}
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
                        ? `الإجمالي (${filtered.length} سند)`
                        : `Total (${filtered.length} receipts)`}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-end">
                    <span className="text-sm font-black font-mono tabular-nums text-emerald-700">
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
        <ReceiptVoucherModal
          agencyId={agencyId}
          onClose={() => setShowModal(false)}
          onSuccess={() => setShowModal(false)}
        />
      )}

      {showRefund && agencyId && showRefund.invoiceId && showRefund.bookingId && (
        <ProcessRefundModal
          bookingId={showRefund.bookingId}
          invoiceId={showRefund.invoiceId}
          agencyId={agencyId}
          paidAmountHalalas={showRefund.amountHalalas}
          onClose={() => setShowRefund(null)}
          onSuccess={() => { setShowRefund(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
