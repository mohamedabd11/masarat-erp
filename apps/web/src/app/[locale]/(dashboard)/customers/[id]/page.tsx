'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import {
  ArrowRight, ArrowLeft, User, Phone, Mail, BookOpen, TrendingUp,
  Calendar, Printer, AlertCircle, CheckCircle2,
  ChevronDown, Star, Award, Crown, Users,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryType = 'invoice' | 'payment' | 'refund' | 'adjustment';

interface StatementEntry {
  id: string;
  date: Date;
  type: EntryType;
  descAr: string;
  descEn: string;
  reference: string;
  debitH: number;
  creditH: number;
}

interface CustomerData {
  id: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  nationality: string;
  nationalId: string;
  tier: 'standard' | 'silver' | 'gold' | 'platinum';
  totalBookings: number;
  totalSpentHalalas: number;
  outstandingHalalas: number;
  createdAt: Date;
  statement: StatementEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_META: Record<string, { ar: string; en: string; icon: typeof Users; bg: string; text: string }> = {
  standard: { ar: 'عادي',    en: 'Standard', icon: Users,  bg: 'bg-slate-100',  text: 'text-slate-600' },
  silver:   { ar: 'فضي',     en: 'Silver',   icon: Star,   bg: 'bg-slate-200',  text: 'text-slate-700' },
  gold:     { ar: 'ذهبي',    en: 'Gold',     icon: Award,  bg: 'bg-amber-100',  text: 'text-amber-700' },
  platinum: { ar: 'بلاتيني', en: 'Platinum', icon: Crown,  bg: 'bg-purple-100', text: 'text-purple-700' },
};

const ENTRY_META: Record<EntryType, { ar: string; en: string; color: string }> = {
  invoice:    { ar: 'فاتورة',  en: 'Invoice',    color: 'text-red-600' },
  payment:    { ar: 'دفعة',    en: 'Payment',    color: 'text-emerald-600' },
  refund:     { ar: 'استرداد', en: 'Refund',     color: 'text-sky-600' },
  adjustment: { ar: 'تسوية',   en: 'Adjustment', color: 'text-amber-600' },
};

const METHOD_AR: Record<string, string> = {
  cash:          'نقداً',
  bank_transfer: 'تحويل بنكي',
  card:          'بطاقة ائتمان',
  online:        'دفع إلكتروني',
};

// ─── API response types ────────────────────────────────────────────────────────

interface ApiCustomer {
  id: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  nationalId: string | null;
  createdAt: string;
}

interface ApiBooking {
  id: string;
  totalPriceHalalas: number;
  paidHalalas: number;
}

interface ApiInvoice {
  id: string;
  invoiceNumber: string;
  totalHalalas: number;
  paidHalalas: number;
  issueDate: string | null;
  createdAt: string;
}

interface ApiPayment {
  id: string;
  amountHalalas: number;
  method: string;
  receiptNumber: string | null;
  type: string;
  receivedAt: string | null;
  createdAt: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params }: { params: { locale: string; id: string } }) {
  const { locale, id } = params;
  const isAr     = locale === 'ar';
  const fmtLoc   = isAr ? 'ar-SA' : 'en-SA';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const { user } = useAuth();

  const [customer, setCustomer]               = useState<CustomerData | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [showFullStatement, setShowFullStatement] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        // 1. Customer
        const custRes = await apiFetch<{ customer: ApiCustomer }>(`/api/customers/${id}`);
        if (cancelled) return;
        const cust = custRes.customer;

        // 2. Bookings, invoices, and payments in parallel
        const [bookingsRes, invoicesRes, paymentsRes] = await Promise.all([
          apiFetch<{ bookings: ApiBooking[] }>(`/api/bookings?customerId=${id}`),
          apiFetch<{ invoices: ApiInvoice[] }>(`/api/invoices?customerId=${id}`),
          apiFetch<{ payments: ApiPayment[] }>(`/api/payments?customerId=${id}`),
        ]);
        if (cancelled) return;

        const bookingList = bookingsRes.bookings;
        const invoiceList = invoicesRes.invoices;
        const paymentList = paymentsRes.payments;

        // 3. Build statement entries
        const statement: StatementEntry[] = [];

        for (const inv of invoiceList) {
          const issueDate = inv.issueDate
            ? new Date(inv.issueDate)
            : new Date(inv.createdAt);
          const invNumber = inv.invoiceNumber ?? inv.id;

          statement.push({
            id:        `inv-${inv.id}`,
            date:      issueDate,
            type:      'invoice',
            descAr:    `فاتورة — ${invNumber}`,
            descEn:    `Invoice — ${invNumber}`,
            reference: invNumber,
            debitH:    inv.totalHalalas ?? 0,
            creditH:   0,
          });
        }

        for (const pay of paymentList) {
          const amount      = pay.amountHalalas ?? 0;
          const receivedAt  = pay.receivedAt
            ? new Date(pay.receivedAt)
            : new Date(pay.createdAt);
          const method        = pay.method ?? 'cash';
          const methodAr      = METHOD_AR[method] ?? 'دفعة';
          const receiptNumber = pay.receiptNumber ?? pay.id;
          const isRefund      = pay.type === 'refund';

          statement.push({
            id:       `pay-${pay.id}`,
            date:     receivedAt,
            type:     isRefund ? 'refund' : 'payment',
            descAr:   isRefund
              ? `استرداد — ${receiptNumber}`
              : `دفعة — ${methodAr} — ${receiptNumber}`,
            descEn:   isRefund
              ? `Refund — ${receiptNumber}`
              : `Payment — ${method} — ${receiptNumber}`,
            reference: receiptNumber,
            debitH:   isRefund ? amount : 0,
            creditH:  isRefund ? 0 : amount,
          });
        }

        // 4. KPIs
        const totalSpentHalalas  = invoiceList.reduce((s, inv) => s + (inv.totalHalalas ?? 0), 0);
        const totalPaidHalalas   = invoiceList.reduce((s, inv) => s + (inv.paidHalalas ?? 0), 0);
        const outstandingHalalas = Math.max(0, totalSpentHalalas - totalPaidHalalas);

        setCustomer({
          id:                cust.id,
          nameAr:            cust.nameAr ?? '',
          nameEn:            cust.nameEn ?? '',
          phone:             cust.phone ?? '',
          email:             cust.email ?? '',
          nationality:       cust.nationality ?? '',
          nationalId:        cust.nationalId ?? '',
          tier:              'standard',
          totalBookings:     bookingList.length,
          totalSpentHalalas,
          outstandingHalalas,
          createdAt:         new Date(cust.createdAt),
          statement,
        });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'حدث خطأ';
          setError(msg.includes('404') || msg.includes('غير موجود')
            ? (isAr ? 'العميل غير موجود' : 'Customer not found')
            : msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [id, user, isAr]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle size={48} className="text-slate-300" />
        <p className="text-slate-500 text-lg font-medium">
          {error || (isAr ? 'العميل غير موجود' : 'Customer not found')}
        </p>
        <Link href={`/${locale}/customers`} className="text-brand-600 text-sm font-semibold hover:underline">
          {isAr ? 'العودة للعملاء' : 'Back to Customers'}
        </Link>
      </div>
    );
  }

  // ── Running balance ───────────────────────────────────────────────────────

  const sorted = [...customer.statement].sort((a, b) => a.date.getTime() - b.date.getTime());
  let runningBalance = 0;
  const enriched = sorted.map(e => {
    runningBalance += e.debitH - e.creditH;
    return { ...e, balance: runningBalance };
  }).reverse();

  const displayedEntries = showFullStatement ? enriched : enriched.slice(0, 8);
  const tierMeta  = TIER_META[customer.tier] ?? TIER_META['standard']!;
  const TierIcon  = tierMeta.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/customers`}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <BackIcon size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              {isAr ? customer.nameAr : (customer.nameEn || customer.nameAr)}
            </h1>
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold',
              tierMeta.bg, tierMeta.text,
            )}>
              <TierIcon size={11} />
              {isAr ? tierMeta.ar : tierMeta.en}
            </span>
          </div>
          <p className="text-slate-500 text-sm font-mono">{customer.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer size={14} />
            {isAr ? 'طباعة الكشف' : 'Print Statement'}
          </button>
          <Link href={`/${locale}/bookings/new?customerId=${customer.id}`}>
            <Button size="sm">
              <BookOpen size={14} />
              {isAr ? 'حجز جديد' : 'New Booking'}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

        {/* Left: Profile + KPIs */}
        <div className="space-y-4">
          <Card>
            <div className="flex flex-col items-center text-center pb-4 border-b border-surface-border mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-2xl font-bold text-white mb-3 shadow-sm">
                {customer.nameAr[0] ?? '؟'}
              </div>
              <h2 className="text-base font-bold text-slate-900">
                {isAr ? customer.nameAr : (customer.nameEn || customer.nameAr)}
              </h2>
              {customer.nameEn && customer.nameAr && (
                <p className="text-xs text-slate-400">{isAr ? customer.nameEn : customer.nameAr}</p>
              )}
              {customer.nationality && (
                <p className="text-sm text-slate-500 mt-0.5">{customer.nationality}</p>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-slate-600">
                <Phone size={14} className="text-slate-400 flex-shrink-0" />
                <span dir="ltr">{customer.phone || '—'}</span>
              </div>
              {customer.email && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Mail size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {customer.nationalId && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <User size={14} className="text-slate-400 flex-shrink-0" />
                  <span dir="ltr" className="font-mono text-xs">{customer.nationalId}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-slate-600">
                <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                <span className="text-xs">
                  {isAr ? 'عميل منذ' : 'Since'} {formatDate(customer.createdAt, fmtLoc)}
                </span>
              </div>
            </div>
          </Card>

          {/* KPIs */}
          <div className="space-y-3">
            {[
              {
                icon: <BookOpen size={16} />,
                bg: 'bg-brand-50', color: 'text-brand-600',
                label: isAr ? 'إجمالي الحجوزات' : 'Total Bookings',
                value: customer.totalBookings.toString(),
              },
              {
                icon: <TrendingUp size={16} />,
                bg: 'bg-emerald-50', color: 'text-emerald-600',
                label: isAr ? 'إجمالي الإنفاق' : 'Total Spent',
                value: formatCurrency(customer.totalSpentHalalas, fmtLoc),
              },
              {
                icon: customer.outstandingHalalas > 0
                  ? <AlertCircle size={16} />
                  : <CheckCircle2 size={16} />,
                bg:    customer.outstandingHalalas > 0 ? 'bg-red-50'     : 'bg-emerald-50',
                color: customer.outstandingHalalas > 0 ? 'text-red-600'  : 'text-emerald-600',
                label: isAr ? 'الرصيد المستحق' : 'Outstanding',
                value: customer.outstandingHalalas > 0
                  ? formatCurrency(customer.outstandingHalalas, fmtLoc)
                  : (isAr ? 'لا يوجد' : 'None'),
              },
            ].map(k => (
              <div key={k.label} className="flex items-center gap-3 p-3.5 bg-white border border-slate-100 rounded-xl">
                <div className={cn('p-2 rounded-lg flex-shrink-0', k.bg)}>
                  <span className={k.color}>{k.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{k.label}</p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums truncate">{k.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Account Statement */}
        <div className="space-y-4">

          {/* Outstanding alert */}
          {customer.outstandingHalalas > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">
                  {isAr
                    ? `مبلغ مستحق: ${formatCurrency(customer.outstandingHalalas, fmtLoc)}`
                    : `Outstanding: ${formatCurrency(customer.outstandingHalalas, fmtLoc)}`}
                </p>
                <p className="text-xs text-red-500">
                  {isAr ? 'يرجى متابعة التحصيل' : 'Follow up on collection required'}
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {enriched.length === 0 && (
            <Card>
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <BookOpen size={40} className="text-slate-200" />
                <p className="text-slate-400 text-sm font-medium">
                  {isAr ? 'لا توجد معاملات بعد' : 'No transactions yet'}
                </p>
                <Link href={`/${locale}/bookings/new?customerId=${customer.id}`}>
                  <Button size="sm" variant="outline">
                    {isAr ? 'إنشاء حجز جديد' : 'Create First Booking'}
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Statement table */}
          {enriched.length > 0 && (
            <Card padding="none">
              <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isAr ? 'كشف حساب العميل' : 'Customer Account Statement'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isAr
                      ? 'جميع الفواتير والمدفوعات مع الرصيد الجاري'
                      : 'All invoices and payments with running balance'}
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Printer size={12} />{isAr ? 'طباعة' : 'Print'}
                </button>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-3 gap-px bg-slate-100">
                {[
                  { labelAr: 'إجمالي الفواتير',   labelEn: 'Total Invoiced', amount: enriched.reduce((s, e) => s + e.debitH, 0),  color: 'text-red-600' },
                  { labelAr: 'إجمالي المدفوعات',   labelEn: 'Total Paid',    amount: enriched.reduce((s, e) => s + e.creditH, 0), color: 'text-emerald-600' },
                  { labelAr: 'الرصيد المستحق',     labelEn: 'Balance Due',   amount: customer.outstandingHalalas,
                    color: customer.outstandingHalalas > 0 ? 'text-red-700' : 'text-emerald-700' },
                ].map(s => (
                  <div key={s.labelEn} className="bg-white px-4 py-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {isAr ? s.labelAr : s.labelEn}
                    </p>
                    <p className={cn('text-sm font-extrabold tabular-nums mt-0.5', s.color)}>
                      {formatCurrency(s.amount, fmtLoc)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-surface-border">
                      <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {isAr ? 'التاريخ' : 'Date'}
                      </th>
                      <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {isAr ? 'البيان' : 'Description'}
                      </th>
                      <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                        {isAr ? 'المرجع' : 'Reference'}
                      </th>
                      <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {isAr ? 'مدين' : 'Debit'}
                      </th>
                      <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {isAr ? 'دائن' : 'Credit'}
                      </th>
                      <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {isAr ? 'الرصيد' : 'Balance'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {displayedEntries.map(entry => {
                      const m = ENTRY_META[entry.type];
                      return (
                        <tr
                          key={entry.id}
                          className={cn(
                            'hover:bg-slate-50/40 transition-colors',
                            entry.type === 'invoice' && 'bg-red-50/20',
                            entry.type === 'payment' && 'bg-emerald-50/10',
                          )}
                        >
                          <td className="ps-5 pe-3 py-3.5">
                            <span className="text-xs text-slate-500">{formatDate(entry.date, fmtLoc)}</span>
                          </td>
                          <td className="px-3 py-3.5">
                            <p className="text-sm font-medium text-slate-800">
                              {isAr ? entry.descAr : entry.descEn}
                            </p>
                            <span className={cn('text-[11px] font-semibold', m.color)}>
                              {isAr ? m.ar : m.en}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 hidden md:table-cell">
                            <span className="text-xs font-mono text-slate-400">{entry.reference}</span>
                          </td>
                          <td className="px-3 py-3.5 text-end">
                            {entry.debitH > 0 ? (
                              <span className="text-sm font-mono tabular-nums text-red-600 font-semibold">
                                {formatCurrency(entry.debitH, fmtLoc)}
                              </span>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-end">
                            {entry.creditH > 0 ? (
                              <span className="text-sm font-mono tabular-nums text-emerald-600 font-semibold">
                                {formatCurrency(entry.creditH, fmtLoc)}
                              </span>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>
                          <td className="pe-5 px-3 py-3.5 text-end">
                            <span className={cn(
                              'text-sm font-bold tabular-nums font-mono',
                              entry.balance > 0 ? 'text-red-700' : entry.balance < 0 ? 'text-emerald-700' : 'text-slate-400',
                            )}>
                              {entry.balance !== 0 ? formatCurrency(Math.abs(entry.balance), fmtLoc) : '—'}
                              {entry.balance > 0 && (
                                <span className="text-[9px] ms-0.5 text-red-400">{isAr ? 'مدين' : 'DR'}</span>
                              )}
                              {entry.balance < 0 && (
                                <span className="text-[9px] ms-0.5 text-emerald-400">{isAr ? 'دائن' : 'CR'}</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {enriched.length > 8 && (
                <div className="px-5 py-3 border-t border-surface-border">
                  <button
                    onClick={() => setShowFullStatement(v => !v)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    <ChevronDown size={15} className={cn('transition-transform', showFullStatement && 'rotate-180')} />
                    {showFullStatement
                      ? (isAr ? 'عرض أقل' : 'Show less')
                      : (isAr ? `عرض الكل (${enriched.length} حركة)` : `Show all (${enriched.length} entries)`)}
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
