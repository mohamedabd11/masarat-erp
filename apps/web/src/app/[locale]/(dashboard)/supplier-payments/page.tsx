'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  ArrowUpRight, Search, X, Banknote, CreditCard,
  Building2, Globe, FileCheck2, CheckCircle2, TrendingDown,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierPayment {
  id: string;
  agencyId: string;
  bookingId?: string;
  bookingNumber?: string;
  supplierName: string;
  amountHalalas: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  status: string;
  createdAt: { toDate?: () => Date } | null;
}

type MethodFilter = 'all' | 'cash' | 'bank_transfer' | 'card' | 'online' | 'check';

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

  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [method, setMethod]     = useState<MethodFilter>('all');

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;

    async function load() {
      const { getFirestore, collection, query, where, orderBy, onSnapshot } =
        await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      const q = query(
        collection(db, 'supplier_payments'),
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc'),
      );

      unsub = onSnapshot(
        q,
        snap => {
          setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierPayment)));
          setLoading(false);
        },
        () => setLoading(false),
      );
    }

    void load();
    return () => unsub?.();
  }, [agencyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter(p => {
      if (method !== 'all' && p.paymentMethod !== method) return false;
      if (!q) return true;
      return (
        p.supplierName.toLowerCase().includes(q) ||
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="p-3 bg-red-50 rounded-2xl border border-red-100 flex-shrink-0">
            <TrendingDown size={24} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isAr ? 'سندات صرف الموردين' : 'Supplier Payments'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {isAr
                ? 'جميع المبالغ المدفوعة للموردين عبر الحجوزات'
                : 'All amounts paid to suppliers across bookings'}
            </p>
          </div>
        </div>

        {/* Summary chip */}
        {!loading && (
          <div className="flex-shrink-0 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-end">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">
              {isAr ? 'إجمالي المعروض' : 'Showing Total'}
            </p>
            <p className="text-lg font-extrabold text-red-700 tabular-nums">
              {formatCurrency(totalHalalas, fmtLocale)}
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالمورد أو رقم الحجز...' : 'Search supplier or booking number...'}
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
                    {isAr ? 'المورد' : 'Supplier'}
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
                  <th className="text-end pe-5 px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'سند' : 'Voucher'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(p => {
                  const date = p.createdAt?.toDate?.() ?? null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="ps-5 pe-3 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                        {date ? formatDate(date, fmtLocale) : '—'}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-sm font-medium text-slate-900">{p.supplierName || '—'}</p>
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
                      <td className="pe-5 px-3 py-3.5 text-end">
                        <Link
                          href={`/${locale}/supplier-payments/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          <CheckCircle2 size={13} />
                          {isAr ? 'عرض' : 'View'}
                          <ArrowUpRight size={12} />
                        </Link>
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
                  <td className="pe-5 px-3 py-3.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
