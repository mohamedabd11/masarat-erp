'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  ArrowRight, ArrowLeft, User, Phone, Mail, BookOpen, TrendingUp,
  Calendar, Printer, FileText, Receipt, AlertCircle, CheckCircle2,
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
  tier: 'standard' | 'silver' | 'gold' | 'vip';
  totalBookings: number;
  totalSpentHalalas: number;
  outstandingHalalas: number;
  createdAt: Date;
  statement: StatementEntry[];
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO: Record<string, CustomerData> = {
  'CUS-001': {
    id: 'CUS-001', nameAr: 'أحمد محمد العمري', nameEn: 'Ahmed Al-Omari',
    phone: '0501234567', email: 'ahmed@example.com', nationality: 'SA', nationalId: '1012345678',
    tier: 'gold', totalBookings: 8, totalSpentHalalas: 4_250_000, outstandingHalalas: 345_000,
    createdAt: new Date('2024-01-15'),
    statement: [
      { id: 'S1',  date: new Date('2026-05-20'), type: 'invoice',    descAr: 'فاتورة — حجز عمرة رمضان 2026',           descEn: 'Invoice — Ramadan Umrah 2026',         reference: 'INV-2026-0088', debitH: 902_500,   creditH: 0 },
      { id: 'S2',  date: new Date('2026-05-21'), type: 'payment',    descAr: 'دفعة مقدمة — تحويل بنكي',               descEn: 'Advance payment — bank transfer',      reference: 'PAY-2026-0071', debitH: 0,         creditH: 557_500 },
      { id: 'S3',  date: new Date('2025-09-10'), type: 'invoice',    descAr: 'فاتورة — طيران الرياض لندن ذهاب وإياب', descEn: 'Invoice — RUH-LHR return flight',      reference: 'INV-2025-0120', debitH: 345_000,   creditH: 0 },
      { id: 'S4',  date: new Date('2025-09-10'), type: 'payment',    descAr: 'دفعة كاملة — نقداً',                    descEn: 'Full payment — cash',                 reference: 'PAY-2025-0095', debitH: 0,         creditH: 345_000 },
      { id: 'S5',  date: new Date('2025-03-15'), type: 'invoice',    descAr: 'فاتورة — فندق هيلتون مكة 5 ليالي',     descEn: 'Invoice — Hilton Makkah 5 nights',    reference: 'INV-2025-0055', debitH: 520_000,   creditH: 0 },
      { id: 'S6',  date: new Date('2025-03-15'), type: 'payment',    descAr: 'دفعة — تحويل إلكتروني',                 descEn: 'Payment — online transfer',           reference: 'PAY-2025-0044', debitH: 0,         creditH: 520_000 },
      { id: 'S7',  date: new Date('2024-12-01'), type: 'invoice',    descAr: 'فاتورة — باقة دبي 4 أيام',             descEn: 'Invoice — Dubai Package 4 days',       reference: 'INV-2024-0210', debitH: 1_380_000, creditH: 0 },
      { id: 'S8',  date: new Date('2024-12-01'), type: 'payment',    descAr: 'دفعة مقدمة',                            descEn: 'Advance payment',                     reference: 'PAY-2024-0195', debitH: 0,         creditH: 800_000 },
      { id: 'S9',  date: new Date('2024-12-28'), type: 'payment',    descAr: 'دفعة أخيرة',                            descEn: 'Final payment',                       reference: 'PAY-2024-0221', debitH: 0,         creditH: 580_000 },
      { id: 'S10', date: new Date('2024-08-10'), type: 'invoice',    descAr: 'فاتورة — تأشيرة شنغن إيطاليا',         descEn: 'Invoice — Italy Schengen Visa',        reference: 'INV-2024-0142', debitH: 280_000,   creditH: 0 },
      { id: 'S11', date: new Date('2024-08-10'), type: 'payment',    descAr: 'دفعة — كاش',                            descEn: 'Payment — cash',                      reference: 'PAY-2024-0115', debitH: 0,         creditH: 280_000 },
      { id: 'S12', date: new Date('2024-04-05'), type: 'invoice',    descAr: 'فاتورة — تأمين سفر سنوي',              descEn: 'Invoice — Annual travel insurance',    reference: 'INV-2024-0058', debitH: 82_500,    creditH: 0 },
      { id: 'S13', date: new Date('2024-04-05'), type: 'payment',    descAr: 'دفعة — تحويل بنكي',                     descEn: 'Payment — bank transfer',             reference: 'PAY-2024-0048', debitH: 0,         creditH: 82_500 },
      { id: 'S14', date: new Date('2024-01-20'), type: 'invoice',    descAr: 'فاتورة — باقة تركيا 7 أيام',           descEn: 'Invoice — Turkey Package 7 days',      reference: 'INV-2024-0012', debitH: 760_000,   creditH: 0 },
      { id: 'S15', date: new Date('2024-01-20'), type: 'payment',    descAr: 'دفعة أولى',                             descEn: 'First payment',                       reference: 'PAY-2024-0009', debitH: 0,         creditH: 760_000 },
    ],
  },
};

// ─── Tier meta ────────────────────────────────────────────────────────────────

const TIER_META = {
  standard: { ar: 'عادي',   en: 'Standard', icon: Users,  bg: 'bg-slate-100',   text: 'text-slate-600' },
  silver:   { ar: 'فضي',    en: 'Silver',   icon: Star,   bg: 'bg-slate-200',   text: 'text-slate-700' },
  gold:     { ar: 'ذهبي',   en: 'Gold',     icon: Award,  bg: 'bg-amber-100',   text: 'text-amber-700' },
  vip:      { ar: 'VIP',    en: 'VIP',      icon: Crown,  bg: 'bg-purple-100',  text: 'text-purple-700' },
};

const ENTRY_META: Record<EntryType, { ar: string; en: string; color: string }> = {
  invoice:    { ar: 'فاتورة',   en: 'Invoice',    color: 'text-red-600' },
  payment:    { ar: 'دفعة',     en: 'Payment',    color: 'text-emerald-600' },
  refund:     { ar: 'استرداد',  en: 'Refund',     color: 'text-sky-600' },
  adjustment: { ar: 'تسوية',    en: 'Adjustment', color: 'text-amber-600' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params }: { params: { locale: string; id: string } }) {
  const { locale, id } = params;
  const isAr    = locale === 'ar';
  const fmtLoc  = isAr ? 'ar-SA' : 'en-SA';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  const customer = DEMO[id];
  const [showFullStatement, setShowFullStatement] = useState(false);

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle size={48} className="text-slate-300" />
        <p className="text-slate-500 text-lg font-medium">{isAr ? 'العميل غير موجود' : 'Customer not found'}</p>
        <Link href={`/${locale}/customers`} className="text-brand-600 text-sm font-semibold hover:underline">
          {isAr ? 'العودة للعملاء' : 'Back to Customers'}
        </Link>
      </div>
    );
  }

  // Compute running balance on statement
  const sorted = [...customer.statement].sort((a, b) => a.date.getTime() - b.date.getTime());
  let runningBalance = 0;
  const enriched = sorted.map(e => {
    runningBalance += e.debitH - e.creditH;
    return { ...e, balance: runningBalance };
  }).reverse();

  const displayedEntries = showFullStatement ? enriched : enriched.slice(0, 8);

  const TierIcon = TIER_META[customer.tier].icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/customers`} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <BackIcon size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{isAr ? customer.nameAr : customer.nameEn}</h1>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold', TIER_META[customer.tier].bg, TIER_META[customer.tier].text)}>
              <TierIcon size={11} />{isAr ? TIER_META[customer.tier].ar : TIER_META[customer.tier].en}
            </span>
          </div>
          <p className="text-slate-500 text-sm font-mono">{customer.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer size={14} />{isAr ? 'طباعة الكشف' : 'Print Statement'}
          </button>
          <Link href={`/${locale}/bookings/new`}>
            <Button size="sm">
              <BookOpen size={14} />
              {isAr ? 'حجز جديد' : 'New Booking'}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

        {/* Left: Profile + stats */}
        <div className="space-y-4">
          <Card>
            <div className="flex flex-col items-center text-center pb-4 border-b border-surface-border mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-2xl font-bold text-white mb-3 shadow-sm">
                {customer.nameAr[0]}
              </div>
              <h2 className="text-base font-bold text-slate-900">{isAr ? customer.nameAr : customer.nameEn}</h2>
              <p className="text-sm text-slate-500">{customer.nationality}</p>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-slate-600">
                <Phone size={14} className="text-slate-400 flex-shrink-0" />
                <span dir="ltr">{customer.phone}</span>
              </div>
              {customer.email && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Mail size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-slate-600">
                <User size={14} className="text-slate-400 flex-shrink-0" />
                <span dir="ltr" className="font-mono text-xs">{customer.nationalId}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-600">
                <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                <span className="text-xs">{isAr ? 'عميل منذ' : 'Since'} {formatDate(customer.createdAt, fmtLoc)}</span>
              </div>
            </div>
          </Card>

          {/* KPIs */}
          <div className="space-y-3">
            {[
              {
                icon: <BookOpen size={16} />, bg: 'bg-brand-50', color: 'text-brand-600',
                label: isAr ? 'إجمالي الحجوزات' : 'Total Bookings',
                value: customer.totalBookings.toString(),
              },
              {
                icon: <TrendingUp size={16} />, bg: 'bg-emerald-50', color: 'text-emerald-600',
                label: isAr ? 'إجمالي الإنفاق' : 'Total Spent',
                value: formatCurrency(customer.totalSpentHalalas, fmtLoc),
              },
              {
                icon: customer.outstandingHalalas > 0 ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />,
                bg: customer.outstandingHalalas > 0 ? 'bg-red-50' : 'bg-emerald-50',
                color: customer.outstandingHalalas > 0 ? 'text-red-600' : 'text-emerald-600',
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
                  {isAr ? `مبلغ مستحق: ${formatCurrency(customer.outstandingHalalas, fmtLoc)}` : `Outstanding: ${formatCurrency(customer.outstandingHalalas, fmtLoc)}`}
                </p>
                <p className="text-xs text-red-500">
                  {isAr ? 'يرجى متابعة التحصيل' : 'Follow up on collection required'}
                </p>
              </div>
              <Button size="sm" onClick={() => {}}>
                {isAr ? 'إرسال تذكير' : 'Send Reminder'}
              </Button>
            </div>
          )}

          {/* Statement table */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{isAr ? 'كشف حساب العميل' : 'Customer Account Statement'}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'جميع الفواتير والمدفوعات مع الرصيد الجاري' : 'All invoices and payments with running balance'}</p>
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
                { labelAr: 'إجمالي الفواتير', labelEn: 'Total Invoiced', amount: enriched.reduce((s, e) => s + e.debitH, 0), color: 'text-red-600' },
                { labelAr: 'إجمالي المدفوعات', labelEn: 'Total Paid',    amount: enriched.reduce((s, e) => s + e.creditH, 0), color: 'text-emerald-600' },
                { labelAr: 'الرصيد المستحق',   labelEn: 'Balance Due',   amount: customer.outstandingHalalas, color: customer.outstandingHalalas > 0 ? 'text-red-700' : 'text-emerald-700' },
              ].map(s => (
                <div key={s.labelEn} className="bg-white px-4 py-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isAr ? s.labelAr : s.labelEn}</p>
                  <p className={cn('text-sm font-extrabold tabular-nums mt-0.5', s.color)}>{formatCurrency(s.amount, fmtLoc)}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-surface-border">
                    <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'البيان' : 'Description'}</th>
                    <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'المرجع' : 'Reference'}</th>
                    <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'مدين' : 'Debit'}</th>
                    <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'دائن' : 'Credit'}</th>
                    <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الرصيد' : 'Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {displayedEntries.map(entry => {
                    const m = ENTRY_META[entry.type];
                    return (
                      <tr key={entry.id} className={cn(
                        'hover:bg-slate-50/40 transition-colors',
                        entry.type === 'invoice' && 'bg-red-50/20',
                        entry.type === 'payment' && 'bg-emerald-50/10',
                      )}>
                        <td className="ps-5 pe-3 py-3.5">
                          <span className="text-xs text-slate-500">{formatDate(entry.date, fmtLoc)}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="text-sm font-medium text-slate-800">{isAr ? entry.descAr : entry.descEn}</p>
                          <span className={cn('text-[11px] font-semibold', m.color)}>{isAr ? m.ar : m.en}</span>
                        </td>
                        <td className="px-3 py-3.5 hidden md:table-cell">
                          <span className="text-xs font-mono text-slate-400">{entry.reference}</span>
                        </td>
                        <td className="px-3 py-3.5 text-end">
                          {entry.debitH > 0 ? (
                            <span className="text-sm font-mono tabular-nums text-red-600 font-semibold">{formatCurrency(entry.debitH, fmtLoc)}</span>
                          ) : <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-3 py-3.5 text-end">
                          {entry.creditH > 0 ? (
                            <span className="text-sm font-mono tabular-nums text-emerald-600 font-semibold">{formatCurrency(entry.creditH, fmtLoc)}</span>
                          ) : <span className="text-slate-200">—</span>}
                        </td>
                        <td className="pe-5 px-3 py-3.5 text-end">
                          <span className={cn('text-sm font-bold tabular-nums font-mono', entry.balance > 0 ? 'text-red-700' : entry.balance < 0 ? 'text-emerald-700' : 'text-slate-400')}>
                            {entry.balance !== 0 ? formatCurrency(Math.abs(entry.balance), fmtLoc) : '—'}
                            {entry.balance > 0 && <span className="text-[9px] ms-0.5 text-red-400">{isAr ? 'مدين' : 'DR'}</span>}
                            {entry.balance < 0 && <span className="text-[9px] ms-0.5 text-emerald-400">{isAr ? 'دائن' : 'CR'}</span>}
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
        </div>
      </div>
    </div>
  );
}
