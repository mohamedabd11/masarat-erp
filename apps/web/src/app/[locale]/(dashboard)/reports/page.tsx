'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useReportsData, type MonthlyRow, type TypeMixRow, type VatInvoice } from '@/hooks/useReportsData';
import { useChartOfAccounts, type ChartAccount } from '@/hooks/useChartOfAccounts';
import {
  TrendingUp, TrendingDown, BarChart3, Download,
  FileText, CheckCircle2, AlertCircle, Printer,
  ChevronDown, ChevronRight, Receipt, Wallet,
  Building2, Scale, ListTree, Stamp, Calendar,
  PieChart, Users, X, Send, ChevronLeft,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VatDateRange {
  from: string;
  to: string;
}

interface TrialAccount {
  code: string;
  nameAr: string;
  nameEn: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openDebit: number;
  openCredit: number;
  mvtDebit: number;
  mvtCredit: number;
}

// ── Profitability demo data (no Firestore source yet) ─────────────────────────

interface ServiceProfit {
  nameAr: string;
  nameEn: string;
  color: string;
  bookings: number;
  revenueH: number;
  costH: number;
}

interface AgentStat {
  nameAr: string;
  nameEn: string;
  bookings: number;
  revenueH: number;
  commH: number;
  convPct: number;
}

interface TopCustomer {
  nameAr: string;
  nameEn: string;
  bookings: number;
  totalH: number;
  lastServiceAr: string;
  lastServiceEn: string;
}

const AGENT_STATS: AgentStat[] = [
  { nameAr: 'أحمد المحمد',   nameEn: 'Ahmad Al-Muhammad', bookings: 74, revenueH: 8_120_000, commH: 520_000, convPct: 88 },
  { nameAr: 'سارة القحطاني', nameEn: 'Sara Al-Qahtani',   bookings: 58, revenueH: 6_340_000, commH: 420_000, convPct: 82 },
  { nameAr: 'خالد العتيبي',  nameEn: 'Khalid Al-Otaibi',  bookings: 41, revenueH: 4_500_000, commH: 310_000, convPct: 79 },
  { nameAr: 'نورة الدوسري',  nameEn: 'Noura Al-Dosari',   bookings: 33, revenueH: 3_620_000, commH: 255_000, convPct: 75 },
  { nameAr: 'فهد الشهري',    nameEn: 'Fahad Al-Shehri',   bookings: 28, revenueH: 2_820_000, commH: 198_000, convPct: 71 },
];

const TOP_CUSTOMERS: TopCustomer[] = [
  { nameAr: 'شركة الأمانة للسفر',    nameEn: 'Al-Amana Travel Co.',   bookings: 18, totalH: 3_240_000, lastServiceAr: 'باقة سياحية', lastServiceEn: 'Tour Package' },
  { nameAr: 'مجموعة نجم للأعمال',    nameEn: 'Najm Business Group',   bookings: 14, totalH: 2_870_000, lastServiceAr: 'طيران',        lastServiceEn: 'Flight' },
  { nameAr: 'عبد الرحمن السلمان',    nameEn: 'Abdulrahman Al-Salman', bookings: 12, totalH: 1_980_000, lastServiceAr: 'عمرة وحج',     lastServiceEn: 'Umrah & Hajj' },
  { nameAr: 'شركة الرواد للمقاولات', nameEn: 'Al-Rowad Contracting',  bookings: 9,  totalH: 1_640_000, lastServiceAr: 'فنادق',        lastServiceEn: 'Hotel' },
  { nameAr: 'د. هند الزهراني',       nameEn: 'Dr. Hind Al-Zahrani',   bookings: 8,  totalH: 1_340_000, lastServiceAr: 'تأشيرة',       lastServiceEn: 'Visa' },
];

const VAT_QUICK_PERIODS: { id: string; labelAr: string; labelEn: string; from: string; to: string }[] = [
  { id: 'q1', labelAr: 'ر١ 2026', labelEn: 'Q1 2026', from: '2026-01-01', to: '2026-03-31' },
  { id: 'q2', labelAr: 'ر٢ 2026', labelEn: 'Q2 2026', from: '2026-04-01', to: '2026-06-30' },
  { id: 'h1', labelAr: 'ن١ 2026', labelEn: 'H1 2026', from: '2026-01-01', to: '2026-06-30' },
  { id: 'fy', labelAr: 'سنوي 2026', labelEn: 'FY 2026', from: '2026-01-01', to: '2026-12-31' },
];

// ─── CSV Export Helper ────────────────────────────────────────────────────────

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function closingDebit(a: TrialAccount)  { return Math.max(0, a.openDebit  + a.mvtDebit  - a.openCredit - a.mvtCredit); }
function closingCredit(a: TrialAccount) { return Math.max(0, a.openCredit + a.mvtCredit - a.openDebit  - a.mvtDebit); }

function accountToTrial(a: ChartAccount): TrialAccount {
  const isDebitNormal = a.type === 'asset' || a.type === 'expense';
  return {
    code: a.code,
    nameAr: a.nameAr,
    nameEn: a.nameEn || a.nameAr,
    category: a.type,
    openDebit: 0,
    openCredit: 0,
    mvtDebit:  isDebitNormal ? Math.max(0, a.balanceHalalas) : 0,
    mvtCredit: !isDebitNormal ? Math.max(0, a.balanceHalalas) : 0,
  };
}

const CATEGORY_META: Record<TrialAccount['category'], { labelAr: string; labelEn: string; borderColor: string; textColor: string; bgColor: string }> = {
  asset:     { labelAr: 'الأصول',           labelEn: 'Assets',          borderColor: 'border-brand-300',   textColor: 'text-brand-700',   bgColor: 'bg-brand-50' },
  liability: { labelAr: 'الخصوم',           labelEn: 'Liabilities',     borderColor: 'border-red-300',     textColor: 'text-red-700',     bgColor: 'bg-red-50' },
  equity:    { labelAr: 'حقوق الملكية',     labelEn: 'Equity',          borderColor: 'border-purple-300',  textColor: 'text-purple-700',  bgColor: 'bg-purple-50' },
  revenue:   { labelAr: 'الإيرادات',        labelEn: 'Revenue',         borderColor: 'border-emerald-300', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  expense:   { labelAr: 'المصروفات',        labelEn: 'Expenses',        borderColor: 'border-amber-300',   textColor: 'text-amber-700',   bgColor: 'bg-amber-50' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, iconBg, iconColor, label, value, sub, trend }: {
  icon: ReactNode; iconBg: string; iconColor: string; label: string;
  value: string | number; sub?: string; trend?: { pct: number; up: boolean };
}) {
  return (
    <Card className="flex items-start gap-4">
      <div className={cn('p-3 rounded-xl flex-shrink-0', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900 tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full',
            trend.up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
            {trend.up ? '↑' : '↓'} {trend.pct}%
          </span>
        )}
      </div>
    </Card>
  );
}

function LoadingPane() {
  return (
    <div className="flex justify-center items-center py-24">
      <Spinner size="lg" />
    </div>
  );
}

function YearNav({ year, setYear, isAr }: { year: number; setYear: (y: number) => void; isAr: boolean }) {
  const currentYear = new Date().getFullYear();
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setYear(year - 1)}
        className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold text-slate-700 w-14 text-center tabular-nums">{year}</span>
      <button onClick={() => setYear(year + 1)} disabled={year >= currentYear}
        className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors disabled:opacity-30">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ monthly, typeMix, loading, year, setYear, isAr, fmtLocale }: {
  monthly: MonthlyRow[]; typeMix: TypeMixRow[]; loading: boolean;
  year: number; setYear: (y: number) => void; isAr: boolean; fmtLocale: string;
}) {
  const totalRev  = monthly.reduce((s, m) => s + m.rev, 0);
  const totalCost = monthly.reduce((s, m) => s + m.cost, 0);
  const totalVat  = monthly.reduce((s, m) => s + m.vat, 0);
  const totalBook = monthly.reduce((s, m) => s + m.bookings, 0);
  const maxRev    = Math.max(...monthly.map(m => m.rev), 1);

  if (loading) return <LoadingPane />;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
          value={formatCurrency(totalRev, fmtLocale)}
          sub={isAr ? 'صافي من الضريبة' : 'Excl. VAT'} />
        <KpiCard icon={<BarChart3 size={20} />} iconBg="bg-sky-50" iconColor="text-sky-600"
          label={isAr ? 'إجمالي الحجوزات' : 'Total Bookings'}
          value={formatCount(totalBook, fmtLocale)}
          sub={isAr ? 'جميع الخدمات' : 'All services'} />
        <KpiCard icon={<Wallet size={20} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label={isAr ? 'إجمالي الربح الإجمالي' : 'Gross Profit'}
          value={totalRev > 0 ? formatCurrency(totalRev - totalCost, fmtLocale) : '—'}
          sub={totalRev > 0 ? `${Math.round(((totalRev - totalCost) / totalRev) * 100)}% ${isAr ? 'هامش' : 'margin'}` : undefined} />
        <KpiCard icon={<Receipt size={20} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'ضريبة محصّلة' : 'VAT Collected'}
          value={formatCurrency(totalVat, fmtLocale)}
          sub={isAr ? 'صافي المستحق لهيئة الزكاة' : 'Net due to ZATCA'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly bar chart */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'الإيرادات الشهرية' : 'Monthly Revenue'}</h2>
            <YearNav year={year} setYear={setYear} isAr={isAr} />
          </div>
          {monthly.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{isAr ? 'لا توجد بيانات لهذه السنة' : 'No data for this year'}</p>
          ) : (
            <div className="space-y-3.5">
              {monthly.map(m => {
                const widthPct = Math.round((m.rev / maxRev) * 100);
                const profitPct = m.rev > 0 ? Math.round(((m.rev - m.cost) / m.rev) * 100) : 0;
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="w-12 text-xs text-slate-500 flex-shrink-0 text-end font-medium">
                      {isAr ? m.nameAr : m.nameEn}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full flex items-center justify-end pe-3 transition-all duration-700"
                        style={{ width: `${widthPct}%` }}
                      >
                        <span className="text-xs font-semibold text-white whitespace-nowrap">
                          {m.bookings} {isAr ? 'حجز' : 'bk'}
                        </span>
                      </div>
                    </div>
                    <div className="w-32 flex-shrink-0">
                      <p className="text-xs font-bold text-slate-900 tabular-nums">{formatCurrency(m.rev, fmtLocale)}</p>
                      {m.cost > 0 && <p className="text-[10px] text-emerald-600 font-medium">+{profitPct}% {isAr ? 'هامش' : 'margin'}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Service type mix */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'توزيع الحجوزات حسب الخدمة' : 'Bookings by Service Type'}</h2>
          </div>
          {typeMix.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{isAr ? 'لا توجد حجوزات بعد' : 'No bookings yet'}</p>
          ) : (
            <div className="space-y-3">
              {typeMix.map(t => (
                <div key={t.type}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', t.dot)} />
                      {isAr ? t.nameAr : t.nameEn}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold tabular-nums text-slate-900">{formatCount(t.count, fmtLocale)}</span>
                      <span className="text-xs text-slate-400 w-8 text-end">{t.pct}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={cn('h-2 rounded-full transition-all duration-700', t.color)} style={{ width: `${t.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-surface-border flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">{isAr ? 'الإجمالي' : 'Total'}</span>
            <span className="text-sm font-bold text-brand-700 tabular-nums">{formatCount(totalBook, fmtLocale)} {isAr ? 'حجز' : 'bookings'}</span>
          </div>
        </Card>
      </div>

      {/* Detailed monthly table */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{isAr ? 'التقرير الشهري التفصيلي' : 'Detailed Monthly Report'}</h2>
          <YearNav year={year} setYear={setYear} isAr={isAr} />
        </div>
        {monthly.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">{isAr ? 'لا توجد فواتير لهذه السنة' : 'No invoices for this year'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-surface-border">
                  {[
                    { label: isAr ? 'الشهر' : 'Month',                  align: 'start ps-6' },
                    { label: isAr ? 'الحجوزات' : 'Bookings',            align: 'end' },
                    { label: isAr ? 'الإيرادات (قبل VAT)' : 'Revenue (excl. VAT)', align: 'end' },
                    { label: isAr ? 'الإجمالي' : 'Grand Total',          align: 'end' },
                    { label: isAr ? 'ضريبة VAT' : 'VAT',                align: 'end pe-6' },
                  ].map((col, i) => (
                    <th key={i} className={`text-${col.align} py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {monthly.map(m => (
                  <tr key={m.month} className="hover:bg-slate-50/60 transition-colors">
                    <td className="ps-6 py-3.5 font-semibold text-slate-900">{isAr ? m.nameAr : m.nameEn}</td>
                    <td className="py-3.5 text-end text-slate-700 tabular-nums">{formatCount(m.bookings, fmtLocale)}</td>
                    <td className="py-3.5 text-end font-mono tabular-nums text-slate-800">{formatCurrency(m.rev, fmtLocale)}</td>
                    <td className="py-3.5 text-end font-mono tabular-nums text-slate-700">{formatCurrency(m.grandTotal, fmtLocale)}</td>
                    <td className="pe-6 py-3.5 text-end font-mono tabular-nums text-amber-700">{formatCurrency(m.vat, fmtLocale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="ps-6 py-3.5 font-bold text-slate-900">{isAr ? 'الإجمالي' : 'Total'}</td>
                  <td className="py-3.5 text-end font-bold text-slate-900 tabular-nums">{formatCount(totalBook, fmtLocale)}</td>
                  <td className="py-3.5 text-end font-bold font-mono tabular-nums text-brand-700">{formatCurrency(totalRev, fmtLocale)}</td>
                  <td className="py-3.5 text-end font-bold font-mono tabular-nums text-slate-800">{formatCurrency(monthly.reduce((s, m) => s + m.grandTotal, 0), fmtLocale)}</td>
                  <td className="pe-6 py-3.5 text-end font-bold font-mono tabular-nums text-amber-700">{formatCurrency(totalVat, fmtLocale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Trial Balance Tab ─────────────────────────────────────────────────────────

function TrialBalanceTab({ accounts, loadingAccounts, isAr, fmtLocale }: {
  accounts: ChartAccount[]; loadingAccounts: boolean; isAr: boolean; fmtLocale: string;
}) {
  const [expanded, setExpanded] = useState<Set<TrialAccount['category']>>(
    new Set<TrialAccount['category']>(['asset', 'liability', 'equity', 'revenue', 'expense'])
  );

  const toggleCat = (c: TrialAccount['category']) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(c) ? next.delete(c) : next.add(c);
    return next;
  });

  const trialAccounts = useMemo(() =>
    accounts.filter(a => a.balanceHalalas !== 0).map(accountToTrial),
  [accounts]);

  const cats: TrialAccount['category'][] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  const totalMvtDebit    = trialAccounts.reduce((s, a) => s + a.mvtDebit, 0);
  const totalMvtCredit   = trialAccounts.reduce((s, a) => s + a.mvtCredit, 0);
  const totalCloseDebit  = trialAccounts.reduce((s, a) => s + closingDebit(a), 0);
  const totalCloseCredit = trialAccounts.reduce((s, a) => s + closingCredit(a), 0);
  const isBalanced = Math.abs(totalCloseDebit - totalCloseCredit) < 1;

  if (loadingAccounts) return <LoadingPane />;

  return (
    <div className="space-y-5">
      <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold',
        isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800')}>
        {isBalanced ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        {isBalanced
          ? (isAr ? 'الميزان متوازن — المدين يساوي الدائن' : 'Trial Balance is balanced — Debit equals Credit')
          : (isAr ? 'تحذير: الميزان غير متوازن' : 'Warning: Trial balance is unbalanced')}
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">{isAr ? 'الكود' : 'Code'}</th>
                <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حركة مدين' : 'Total Debit'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حركة دائن' : 'Total Credit'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رصيد مدين' : 'Balance Dr'}</th>
                <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رصيد دائن' : 'Balance Cr'}</th>
              </tr>
            </thead>
            <tbody>
              {trialAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                    {isAr ? 'لا توجد أرصدة بعد — ابدأ بإنشاء الفواتير والمدفوعات' : 'No balances yet — start by creating invoices and payments'}
                  </td>
                </tr>
              ) : (
                cats.map(cat => {
                  const meta = CATEGORY_META[cat];
                  const catAccounts = trialAccounts.filter(a => a.category === cat);
                  if (catAccounts.length === 0) return null;
                  const catMvtD   = catAccounts.reduce((s, a) => s + a.mvtDebit, 0);
                  const catMvtC   = catAccounts.reduce((s, a) => s + a.mvtCredit, 0);
                  const catCloseD = catAccounts.reduce((s, a) => s + closingDebit(a), 0);
                  const catCloseC = catAccounts.reduce((s, a) => s + closingCredit(a), 0);
                  const isOpen = expanded.has(cat);

                  return (
                    <>
                      <tr
                        key={`cat-${cat}`}
                        className={cn('cursor-pointer hover:brightness-95 transition-all', meta.bgColor)}
                        onClick={() => toggleCat(cat)}
                      >
                        <td colSpan={2} className="ps-4 pe-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                            <span className={cn('text-sm font-bold', meta.textColor)}>
                              {isAr ? meta.labelAr : meta.labelEn}
                            </span>
                            <span className="text-xs text-slate-400 font-normal">({catAccounts.length})</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700 tabular-nums font-mono">{catMvtD   > 0 ? formatCurrency(catMvtD,   fmtLocale) : '—'}</td>
                        <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700 tabular-nums font-mono">{catMvtC   > 0 ? formatCurrency(catMvtC,   fmtLocale) : '—'}</td>
                        <td className="px-3 py-2.5 text-end text-sm font-bold tabular-nums font-mono text-slate-900">{catCloseD > 0 ? formatCurrency(catCloseD, fmtLocale) : '—'}</td>
                        <td className="pe-5 px-3 py-2.5 text-end text-sm font-bold tabular-nums font-mono text-slate-900">{catCloseC > 0 ? formatCurrency(catCloseC, fmtLocale) : '—'}</td>
                      </tr>
                      {isOpen && catAccounts.map(a => (
                        <tr key={a.code} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                          <td className="ps-5 pe-3 py-2.5">
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{a.code}</span>
                          </td>
                          <td className="ps-6 pe-3 py-2.5 text-sm text-slate-700">{isAr ? a.nameAr : a.nameEn}</td>
                          <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{a.mvtDebit  > 0 ? formatCurrency(a.mvtDebit,  fmtLocale) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{a.mvtCredit > 0 ? formatCurrency(a.mvtCredit, fmtLocale) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{closingDebit(a)  > 0 ? formatCurrency(closingDebit(a),  fmtLocale) : <span className="text-slate-300">—</span>}</td>
                          <td className="pe-5 px-3 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{closingCredit(a) > 0 ? formatCurrency(closingCredit(a), fmtLocale) : <span className="text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td colSpan={2} className="ps-5 pe-3 py-3.5">
                  <span className="text-sm font-black text-slate-900 uppercase tracking-wide">{isAr ? 'الإجمالي الكلي' : 'Grand Total'}</span>
                </td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(totalMvtDebit,    fmtLocale)}</td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(totalMvtCredit,   fmtLocale)}</td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-brand-700">{formatCurrency(totalCloseDebit,  fmtLocale)}</td>
                <td className="pe-5 px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-brand-700">{formatCurrency(totalCloseCredit, fmtLocale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Income Statement Tab ─────────────────────────────────────────────────────

function IncomeStatementTab({ accounts, loadingAccounts, isAr, fmtLocale }: {
  accounts: ChartAccount[]; loadingAccounts: boolean; isAr: boolean; fmtLocale: string;
}) {
  const { revenueAccounts, expenseAccounts, totalRevenue, totalExpense, netProfit, grossMargin, netMargin } = useMemo(() => {
    const revenueAccounts = accounts.filter(a => a.type === 'revenue' && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const expenseAccounts = accounts.filter(a => a.type === 'expense' && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalExpense = expenseAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const netProfit = totalRevenue - totalExpense;
    const grossMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
    const netMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
    return { revenueAccounts, expenseAccounts, totalRevenue, totalExpense, netProfit, grossMargin, netMargin };
  }, [accounts]);

  if (loadingAccounts) return <LoadingPane />;

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={18} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
          value={formatCurrency(totalRevenue, fmtLocale)} />
        <KpiCard icon={<TrendingDown size={18} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'إجمالي المصروفات' : 'Total Expenses'}
          value={formatCurrency(totalExpense, fmtLocale)} />
        <KpiCard icon={<Scale size={18} />} iconBg={netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'} iconColor={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
          label={isAr ? 'صافي الربح' : 'Net Profit'}
          value={formatCurrency(Math.abs(netProfit), fmtLocale)}
          sub={`${netMargin >= 0 ? '+' : '-'}${Math.abs(netMargin)}% ${isAr ? 'هامش' : 'margin'}`} />
        <KpiCard icon={<TrendingUp size={18} />} iconBg="bg-sky-50" iconColor="text-sky-600"
          label={isAr ? 'هامش الربح' : 'Profit Margin'}
          value={`${grossMargin}%`} />
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'قائمة الدخل (الأرباح والخسائر)' : 'Income Statement (Profit & Loss)'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{isAr ? 'مجمّع من دليل الحسابات' : 'Aggregated from Chart of Accounts'}</p>
          </div>
          <button className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
            onClick={() => window.print()}>
            <Printer size={13} />{isAr ? 'طباعة' : 'Print'}
          </button>
        </div>

        {revenueAccounts.length === 0 && expenseAccounts.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">{isAr ? 'لا توجد إيرادات أو مصروفات مسجّلة بعد' : 'No revenue or expense entries yet'}</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {/* Revenue section */}
            <div>
              <div className="px-6 py-2 bg-emerald-50">
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
                  {isAr ? 'الإيرادات' : 'REVENUE'}
                </span>
              </div>
              {revenueAccounts.map(a => (
                <div key={a.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/60 transition-colors">
                  <span className="text-sm ps-4 text-slate-600 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.code}</span>
                    {isAr ? a.nameAr : a.nameEn}
                  </span>
                  <span className="tabular-nums font-mono text-sm font-medium text-slate-800">
                    {formatCurrency(a.balanceHalalas, fmtLocale)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-6 py-3 bg-white">
                <span className="text-sm font-bold text-slate-900">{isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}</span>
                <span className="tabular-nums font-mono text-sm font-black text-emerald-700">{formatCurrency(totalRevenue, fmtLocale)}</span>
              </div>
            </div>

            {/* Expense section */}
            <div>
              <div className="px-6 py-2 bg-amber-50">
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-600">
                  {isAr ? 'المصروفات' : 'EXPENSES'}
                </span>
              </div>
              {expenseAccounts.map(a => (
                <div key={a.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/60 transition-colors">
                  <span className="text-sm ps-4 text-slate-600 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.code}</span>
                    {isAr ? a.nameAr : a.nameEn}
                  </span>
                  <span className="tabular-nums font-mono text-sm font-medium text-red-600">
                    ({formatCurrency(a.balanceHalalas, fmtLocale)})
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-6 py-3 bg-white">
                <span className="text-sm font-bold text-slate-900">{isAr ? 'إجمالي المصروفات' : 'Total Expenses'}</span>
                <span className="tabular-nums font-mono text-sm font-black text-red-600">({formatCurrency(totalExpense, fmtLocale)})</span>
              </div>
            </div>
          </div>
        )}

        {/* Net Profit footer */}
        <div className={cn('px-6 py-5 border-t-2 flex items-center justify-between',
          netProfit >= 0 ? 'bg-gradient-to-r from-emerald-50 to-white border-emerald-300' : 'bg-gradient-to-r from-red-50 to-white border-red-300')}>
          <div>
            <p className={cn('text-[11px] font-black uppercase tracking-widest mb-1', netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {isAr ? 'صافي الربح النهائي' : 'NET PROFIT'}
            </p>
            <p className={cn('text-xs', netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {netMargin >= 0 ? '+' : ''}{netMargin}% {isAr ? 'هامش الربح الصافي' : 'Net Profit Margin'}
            </p>
          </div>
          <p className={cn('text-3xl font-black tabular-nums', netProfit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
            {netProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(netProfit), fmtLocale)}{netProfit < 0 ? ')' : ''}
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── VAT Return Tab ───────────────────────────────────────────────────────────

function VATReturnTab({ vatInvoices, loadingVat, isAr, fmtLocale, vatRange, onVatRangeChange }: {
  vatInvoices: VatInvoice[]; loadingVat: boolean;
  isAr: boolean; fmtLocale: string;
  vatRange: VatDateRange; onVatRangeChange: (r: VatDateRange) => void;
}) {
  const { standardBase, standardVat, zeroBase, totalBase, totalVat, netVat } = useMemo(() => {
    const from = new Date(vatRange.from + 'T00:00:00');
    const to   = new Date(vatRange.to   + 'T23:59:59');
    const filtered = vatInvoices.filter(inv => inv.createdAt >= from && inv.createdAt <= to);
    const registered    = filtered.filter(inv => inv.isVatRegistered);
    const nonRegistered = filtered.filter(inv => !inv.isVatRegistered);
    const standardBase = registered.reduce((s, inv) => s + inv.subtotalExclVat, 0);
    const standardVat  = registered.reduce((s, inv) => s + inv.totalVat, 0);
    const zeroBase     = nonRegistered.reduce((s, inv) => s + inv.subtotalExclVat, 0);
    const totalBase    = standardBase + zeroBase;
    const totalVat     = standardVat;
    const netVat       = standardVat;
    return { standardBase, standardVat, zeroBase, totalBase, totalVat, netVat };
  }, [vatInvoices, vatRange]);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitted, setSubmitted]             = useState(false);

  const activePreset = VAT_QUICK_PERIODS.find(p => p.from === vatRange.from && p.to === vatRange.to);

  interface VATBoxDef {
    box: string;
    labelAr: string;
    labelEn: string;
    noteAr: string;
    noteEn: string;
    base: number;
    vat: number;
    rate?: '15%' | '0%' | 'exempt' | 'reverse';
    highlight: 'output' | 'input' | 'net-due';
  }

  const vatBoxes: VATBoxDef[] = [
    { box: '1', highlight: 'output', rate: '15%',
      labelAr: 'الإمدادات الخاضعة للضريبة بالسعر القياسي (15%)',
      labelEn: 'Standard Rated Domestic Supplies (15%)',
      noteAr: 'الفواتير الضريبية المسجلة',
      noteEn: 'VAT-registered tax invoices',
      base: standardBase, vat: standardVat },
    { box: '2', highlight: 'output', rate: '0%',
      labelAr: 'الإمدادات الخاضعة للضريبة بالسعر الصفري (0%)',
      labelEn: 'Zero-Rated Supplies (0%)',
      noteAr: 'فواتير غير مسجلة ضريبياً (صفري / معفى)',
      noteEn: 'Non-VAT-registered invoices (zero-rated / exempt)',
      base: zeroBase, vat: 0 },
    { box: '6', highlight: 'output',
      labelAr: 'إجمالي المبيعات (1+2)',
      labelEn: 'Total Sales (1+2)',
      noteAr: 'الإجمالي الكلي لجميع الإمدادات',
      noteEn: 'Grand total of all supplies',
      base: totalBase, vat: totalVat },
    { box: '11', highlight: 'net-due',
      labelAr: 'إجمالي ضريبة المبيعات المستحقة',
      labelEn: 'Total Output VAT Due',
      noteAr: 'مجموع ضريبة المخرجات',
      noteEn: 'Sum of output VAT',
      base: 0, vat: totalVat },
    { box: '13', highlight: 'net-due',
      labelAr: 'صافي الضريبة المستحقة',
      labelEn: 'Net VAT Due',
      noteAr: 'المبلغ المستحق للدفع لهيئة الزكاة والضريبة والجمارك',
      noteEn: 'Amount payable to ZATCA',
      base: 0, vat: netVat },
  ];

  const outputBoxes = vatBoxes.filter(b => b.highlight === 'output');
  const netBoxes    = vatBoxes.filter(b => b.highlight === 'net-due');

  const rateBadgeMap: Record<string, string> = {
    '15%':    'bg-red-100 text-red-700',
    '0%':     'bg-sky-100 text-sky-700',
    'exempt': 'bg-slate-100 text-slate-500',
  };

  function BoxRow({ b }: { b: VATBoxDef }) {
    const rateBadge = b.rate ? (rateBadgeMap[b.rate] ?? '') : '';
    const dotColor  = b.highlight === 'output' ? 'bg-brand-600' : 'bg-emerald-600';
    return (
      <div className="border-b border-slate-100 last:border-0 p-4">
        <div className="flex items-start gap-3">
          <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 text-white', dotColor)}>
            {b.box}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap mb-0.5">
              <p className="text-sm font-semibold text-slate-900 flex-1">{isAr ? b.labelAr : b.labelEn}</p>
              {b.rate && <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0', rateBadge)}>{b.rate}</span>}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{isAr ? b.noteAr : b.noteEn}</p>
            <div className="flex items-center gap-6 pt-2 border-t border-slate-100">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{isAr ? 'الوعاء الضريبي' : 'Tax Base'}</p>
                <p className="text-sm font-mono tabular-nums font-semibold text-slate-700">
                  {b.base > 0 ? formatCurrency(b.base, fmtLocale) : <span className="text-slate-300">—</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{isAr ? 'مبلغ الضريبة' : 'VAT Amount'}</p>
                <p className={cn('text-sm font-mono tabular-nums font-bold',
                  b.box === '13' ? 'text-emerald-700 text-base' : 'text-slate-900')}>
                  {b.vat > 0 ? formatCurrency(b.vat, fmtLocale) : <span className="text-slate-300">—</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Section({ title, boxes, accentBg, accentBorder }: {
    title: string; boxes: VATBoxDef[]; accentBg: string; accentBorder: string;
  }) {
    return (
      <div className={cn('rounded-xl border overflow-hidden', accentBorder)}>
        <div className={cn('px-5 py-3', accentBg)}>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">{title}</h3>
        </div>
        {boxes.map(b => <BoxRow key={b.box} b={b} />)}
      </div>
    );
  }

  if (loadingVat) return <LoadingPane />;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-brand-700">
          <Stamp size={20} />
          <div>
            <p className="font-black text-base">{isAr ? 'إقرار ضريبة القيمة المضافة' : 'VAT Return — ZATCA'}</p>
            <p className="text-xs text-brand-600">{isAr ? 'متوافق مع هيئة الزكاة والضريبة والجمارك' : 'Compliant with Saudi ZATCA requirements'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {VAT_QUICK_PERIODS.map(p => (
            <button key={p.id} onClick={() => onVatRangeChange({ from: p.from, to: p.to })}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                activePreset?.id === p.id ? 'bg-brand-600 text-white' : 'bg-white border border-brand-200 text-brand-700 hover:bg-brand-100')}>
              {isAr ? p.labelAr : p.labelEn}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Calendar size={14} className="text-brand-600 flex-shrink-0 hidden sm:block" />
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <label className="text-[10px] font-bold text-brand-700 block mb-0.5">{isAr ? 'من تاريخ' : 'From'}</label>
              <input type="date" value={vatRange.from} onChange={e => onVatRangeChange({ ...vatRange, from: e.target.value })}
                className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <span className="text-brand-400 mt-4 hidden sm:block">—</span>
            <div>
              <label className="text-[10px] font-bold text-brand-700 block mb-0.5">{isAr ? 'إلى تاريخ' : 'To'}</label>
              <input type="date" value={vatRange.to} onChange={e => onVatRangeChange({ ...vatRange, to: e.target.value })}
                className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
        </div>
      </div>

      <Section title={isAr ? 'القسم الأول — المبيعات وضريبة المخرجات' : 'Part I — Sales & Output VAT'}
        boxes={outputBoxes} accentBg="bg-brand-50" accentBorder="border-brand-200" />

      <Section title={isAr ? 'القسم الثاني — صافي الضريبة المستحقة' : 'Part II — Net VAT Due'}
        boxes={netBoxes} accentBg="bg-emerald-50" accentBorder="border-emerald-200" />

      {/* Summary + submit */}
      <Card>
        <h3 className="text-sm font-bold text-slate-900 mb-4">{isAr ? 'ملخص الإقرار' : 'Return Summary'}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-3">
            <span className="text-slate-600">{isAr ? 'إجمالي ضريبة المخرجات (15%)' : 'Total Output VAT (15%)'}</span>
            <span className="font-bold font-mono tabular-nums text-red-600">{formatCurrency(standardVat, fmtLocale)}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-3">
            <span className="text-slate-600">{isAr ? 'وعاء ضريبي بالسعر القياسي' : 'Standard Rated Tax Base'}</span>
            <span className="font-bold font-mono tabular-nums text-slate-700">{formatCurrency(standardBase, fmtLocale)}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-3">
            <span className="text-slate-600">{isAr ? 'إمدادات بالسعر الصفري' : 'Zero-Rated Supplies'}</span>
            <span className="font-bold font-mono tabular-nums text-slate-700">{formatCurrency(zeroBase, fmtLocale)}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-black text-slate-900">{isAr ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span>
            <span className="text-xl font-black text-emerald-700 tabular-nums font-mono">
              {formatCurrency(netVat, fmtLocale)}
            </span>
          </div>
        </div>

        {submitted ? (
          <div className="mt-5 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-700">{isAr ? 'تم تقديم الإقرار بنجاح' : 'VAT Return submitted successfully'}</p>
              <p className="text-xs text-emerald-600">{isAr ? 'سيتم الربط بهيئة الزكاة عند التفعيل' : 'Will sync with ZATCA portal when activated'}</p>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowSubmitModal(true)}
            className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors shadow-sm">
            <Send size={16} />
            {isAr ? 'تقديم الإقرار الضريبي' : 'Submit VAT Return'}
          </button>
        )}
        <p className="text-[10px] text-center text-slate-400 mt-2">
          {isAr ? 'سيتم ربط هذا القسم مع بوابة ZATCA عند تفعيل خاصية الإرسال الإلكتروني' : 'Will connect to ZATCA portal when e-filing is enabled'}
        </p>
      </Card>

      {/* Submit modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Stamp size={20} className="text-brand-600" />
                {isAr ? 'تأكيد تقديم الإقرار الضريبي' : 'Confirm VAT Return Submission'}
              </h2>
              <button onClick={() => setShowSubmitModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-bold text-amber-700 mb-1">{isAr ? 'تحقق قبل التقديم' : 'Verify before submitting'}</p>
                <p className="text-xs text-amber-600">{isAr ? 'تأكد من مراجعة جميع الخانات والأرقام قبل تقديم الإقرار' : 'Please review all boxes and amounts before submitting to ZATCA'}</p>
              </div>
              <div className="space-y-2 bg-slate-50 rounded-xl p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{isAr ? 'الفترة الضريبية' : 'Tax Period'}</span>
                  <span className="font-semibold text-slate-900">{vatRange.from} → {vatRange.to}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{isAr ? 'إجمالي ضريبة المخرجات' : 'Output VAT'}</span>
                  <span className="font-semibold text-red-700">{formatCurrency(standardVat, fmtLocale)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 mt-2">
                  <span className="text-slate-900">{isAr ? 'صافي الضريبة المستحقة' : 'Net VAT Due'}</span>
                  <span className="text-brand-700 text-base">{formatCurrency(netVat, fmtLocale)}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-surface-border flex gap-3">
              <button onClick={() => setShowSubmitModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                {isAr ? 'مراجعة الإقرار' : 'Review Return'}
              </button>
              <button onClick={() => { setShowSubmitModal(false); setSubmitted(true); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors flex items-center justify-center gap-2">
                <Send size={15} />
                {isAr ? 'تأكيد التقديم' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Balance Sheet Tab ────────────────────────────────────────────────────────

function BalanceSheetTab({ accounts, loadingAccounts, isAr, fmtLocale }: {
  accounts: ChartAccount[]; loadingAccounts: boolean; isAr: boolean; fmtLocale: string;
}) {
  const { assetAccounts, liabilityAccounts, equityAccounts, revenueAccounts, expenseAccounts,
          totalAssets, totalLiabilities, totalEquity, netProfit } = useMemo(() => {
    const assetAccounts     = accounts.filter(a => a.type === 'asset'     && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const liabilityAccounts = accounts.filter(a => a.type === 'liability' && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const equityAccounts    = accounts.filter(a => a.type === 'equity'    && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const revenueAccounts   = accounts.filter(a => a.type === 'revenue');
    const expenseAccounts   = accounts.filter(a => a.type === 'expense');
    const totalAssets       = assetAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalLiabilities  = liabilityAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalEquity       = equityAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalRevenue      = revenueAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalExpense      = expenseAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const netProfit         = totalRevenue - totalExpense;
    return { assetAccounts, liabilityAccounts, equityAccounts, revenueAccounts, expenseAccounts,
             totalAssets, totalLiabilities, totalEquity, netProfit };
  }, [accounts]);

  const totalLiabEquity = totalLiabilities + totalEquity + netProfit;
  const balanced = Math.abs(totalAssets - totalLiabEquity) < 1;

  if (loadingAccounts) return <LoadingPane />;

  function AccountRow({ a }: { a: ChartAccount }) {
    return (
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 transition-colors">
        <span className="text-sm text-slate-700 flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.code}</span>
          {isAr ? a.nameAr : a.nameEn}
        </span>
        <span className="text-sm font-mono tabular-nums text-slate-800">{formatCurrency(a.balanceHalalas, fmtLocale)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { labelAr: 'إجمالي الأصول',        labelEn: 'Total Assets',       amount: totalAssets,      bg: 'bg-brand-600', text: 'text-white' },
          { labelAr: 'إجمالي الخصوم',        labelEn: 'Total Liabilities',  amount: totalLiabilities, bg: 'bg-red-600',   text: 'text-white' },
          { labelAr: 'إجمالي حقوق الملكية',  labelEn: 'Total Equity',       amount: totalEquity + netProfit, bg: 'bg-purple-600', text: 'text-white' },
        ].map(s => (
          <div key={s.labelEn} className={`${s.bg} ${s.text} rounded-2xl p-5 shadow-sm`}>
            <p className="text-xs font-bold uppercase tracking-widest opacity-75 mb-1">{isAr ? s.labelAr : s.labelEn}</p>
            <p className="text-2xl font-extrabold tabular-nums">{formatCurrency(s.amount, fmtLocale)}</p>
          </div>
        ))}
      </div>

      {/* Balance check */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        {balanced
          ? <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          : <AlertCircle  size={18} className="text-red-600 flex-shrink-0" />}
        <div>
          <p className={`text-sm font-bold ${balanced ? 'text-emerald-700' : 'text-red-700'}`}>
            {balanced
              ? (isAr ? 'الميزانية متوازنة — الأصول = الخصوم + حقوق الملكية + صافي الربح' : 'Balance sheet balanced — Assets = Liabilities + Equity + Net Profit')
              : (isAr ? 'تحذير: الميزانية غير متوازنة' : 'Warning: Balance sheet is out of balance')}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatCurrency(totalAssets, fmtLocale)} = {formatCurrency(totalLiabilities, fmtLocale)} + {formatCurrency(totalEquity, fmtLocale)} + {formatCurrency(netProfit, fmtLocale)}
          </p>
        </div>
      </div>

      {totalAssets === 0 && totalLiabilities === 0 && totalEquity === 0 && netProfit === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">{isAr ? 'لا توجد أرصدة بعد — ابدأ بإنشاء الفواتير' : 'No balances yet — start by creating invoices'}</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Assets side */}
          <div className="space-y-4">
            <Card padding="none">
              <div className="px-5 py-3 border-b bg-brand-50 border-brand-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-700">{isAr ? 'الأصول' : 'Assets'}</h3>
                <span className="text-sm font-extrabold tabular-nums text-brand-700">{formatCurrency(totalAssets, fmtLocale)}</span>
              </div>
              {assetAccounts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">{isAr ? 'لا أرصدة' : 'No balances'}</p>
              ) : (
                assetAccounts.map(a => <AccountRow key={a.id} a={a} />)
              )}
            </Card>
          </div>

          {/* Liabilities + Equity side */}
          <div className="space-y-4">
            <Card padding="none">
              <div className="px-5 py-3 border-b bg-red-50 border-red-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-red-700">{isAr ? 'الخصوم' : 'Liabilities'}</h3>
                <span className="text-sm font-extrabold tabular-nums text-red-700">{formatCurrency(totalLiabilities, fmtLocale)}</span>
              </div>
              {liabilityAccounts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">{isAr ? 'لا أرصدة' : 'No balances'}</p>
              ) : (
                liabilityAccounts.map(a => <AccountRow key={a.id} a={a} />)
              )}
            </Card>

            <Card padding="none">
              <div className="px-5 py-3 border-b bg-purple-50 border-purple-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-purple-700">{isAr ? 'حقوق الملكية' : 'Equity'}</h3>
                <span className="text-sm font-extrabold tabular-nums text-purple-700">{formatCurrency(totalEquity + netProfit, fmtLocale)}</span>
              </div>
              {equityAccounts.map(a => <AccountRow key={a.id} a={a} />)}
              {/* Current period net profit */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 transition-colors">
                <span className={cn('text-sm flex items-center gap-2', netProfit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {isAr ? 'صافي ربح الفترة الحالية' : 'Current Period Net Profit'}
                </span>
                <span className={cn('text-sm font-mono tabular-nums font-semibold', netProfit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {netProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(netProfit), fmtLocale)}{netProfit < 0 ? ')' : ''}
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profitability Tab ────────────────────────────────────────────────────────

function ProfitabilityTab({ monthly, typeMix, loading, isAr, fmtLocale }: {
  monthly: MonthlyRow[]; typeMix: TypeMixRow[]; loading: boolean;
  isAr: boolean; fmtLocale: string;
}) {
  const totalRev  = monthly.reduce((s, m) => s + m.rev, 0);
  const totalVat  = monthly.reduce((s, m) => s + m.vat, 0);
  const maxRev    = Math.max(...monthly.map(m => m.rev), 1);

  if (loading) return <LoadingPane />;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'} value={formatCurrency(totalRev, fmtLocale)} />
        <KpiCard icon={<Receipt size={20} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'ضريبة محصّلة' : 'VAT Collected'} value={formatCurrency(totalVat, fmtLocale)} />
        <KpiCard icon={<Wallet size={20} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label={isAr ? 'عدد الخدمات' : 'Service Types'} value={typeMix.length} />
        <KpiCard icon={<Users size={20} />} iconBg="bg-purple-50" iconColor="text-purple-600"
          label={isAr ? 'أفضل وكيل (تجريبي)' : 'Top Agent (demo)'} value={isAr ? AGENT_STATS[0].nameAr : AGENT_STATS[0].nameEn}
          sub={formatCurrency(AGENT_STATS[0].revenueH, fmtLocale)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* By Service (from real typeMix data) */}
        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-5">{isAr ? 'الحجوزات حسب الخدمة' : 'Bookings by Service'}</h2>
          {typeMix.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{isAr ? 'لا توجد حجوزات بعد' : 'No bookings yet'}</p>
          ) : (
            <div className="space-y-4">
              {typeMix.map(t => {
                const maxCount = Math.max(...typeMix.map(x => x.count), 1);
                const barW = Math.round((t.count / maxCount) * 100);
                return (
                  <div key={t.type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.dot}`} />
                        <span className="text-sm font-semibold text-slate-800">{isAr ? t.nameAr : t.nameEn}</span>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <span className="text-sm font-bold tabular-nums text-slate-900 block">{formatCount(t.count, fmtLocale)} {isAr ? 'حجز' : 'bk'}</span>
                        <span className="text-xs text-slate-400">{t.pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${t.color} rounded-full transition-all duration-700`} style={{ width: `${barW}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Agent performance (demo) */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'أداء الموظفين (تجريبي)' : 'Agent Performance (demo)'}</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الموظف' : 'Agent'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حجوزات' : 'Bookings'}</th>
                <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'نسبة التحويل' : 'Conv. Rate'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {AGENT_STATS.map((a, idx) => (
                <tr key={a.nameEn} className="hover:bg-slate-50/40 transition-colors">
                  <td className="ps-5 pe-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{isAr ? a.nameAr : a.nameEn}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-end">
                    <span className="text-sm font-bold tabular-nums text-slate-900">{formatCount(a.bookings, fmtLocale)}</span>
                  </td>
                  <td className="pe-5 px-3 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${a.convPct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">{a.convPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Monthly trend (real data) */}
      {monthly.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'الاتجاه الشهري — الإيرادات' : 'Monthly Revenue Trend'}</h2>
          </div>
          <div className="space-y-3">
            {monthly.map(m => {
              const revW = Math.round((m.rev / maxRev) * 100);
              return (
                <div key={m.month} className="grid grid-cols-[80px_1fr_120px] gap-3 items-center">
                  <span className="text-xs font-medium text-slate-500 text-end">{isAr ? m.nameAr : m.nameEn}</span>
                  <div className="relative h-8 bg-slate-100 rounded-lg overflow-hidden">
                    <div className="absolute inset-y-0 start-0 bg-brand-500/20 rounded-lg transition-all" style={{ width: `${revW}%` }} />
                    <div className="absolute inset-y-0 start-0 bg-brand-600 rounded-lg transition-all h-1.5 top-1/2 -translate-y-1/2 ms-1" style={{ width: `${revW}%` }} />
                  </div>
                  <div className="text-end">
                    <p className="text-xs font-bold tabular-nums text-slate-900">{formatCurrency(m.rev, fmtLocale)}</p>
                    <p className="text-[10px] text-slate-400">{m.bookings} {isAr ? 'حجز' : 'bk'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Top Customers (demo) */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{isAr ? 'أفضل العملاء (تجريبي)' : 'Top Customers (demo)'}</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-surface-border">
              <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
              <th className="text-start pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
              <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حجوزات' : 'Bookings'}</th>
              <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {TOP_CUSTOMERS.map((c, idx) => (
              <tr key={c.nameEn} className="hover:bg-slate-50/40 transition-colors">
                <td className="ps-5 pe-3 py-3.5">
                  <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500')}>
                    {idx + 1}
                  </span>
                </td>
                <td className="pe-3 py-3.5">
                  <p className="text-sm font-semibold text-slate-900">{isAr ? c.nameAr : c.nameEn}</p>
                </td>
                <td className="px-3 py-3.5 text-end">
                  <span className="text-sm tabular-nums font-bold text-slate-800">{formatCount(c.bookings, fmtLocale)}</span>
                </td>
                <td className="pe-5 px-3 py-3.5 text-end">
                  <span className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(c.totalH, fmtLocale)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'trial' | 'pl' | 'vat' | 'bs' | 'profit';

export default function ReportsPage() {
  const locale    = useLocale();
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;

  const { monthly, typeMix, vatInvoices, loading: loadingReports, year, setYear } = useReportsData(agencyId);
  const { accounts, loading: loadingAccounts } = useChartOfAccounts();

  const [activeTab, setActiveTab]   = useState<TabId>('overview');
  const [vatRange, setVatRange]     = useState<VatDateRange>({ from: '2026-01-01', to: '2026-06-30' });
  const [showExport, setShowExport] = useState(false);

  function handleExportCSV() {
    if (activeTab === 'trial') {
      const trialRows = accounts.filter(a => a.balanceHalalas !== 0).map(accountToTrial);
      downloadCSV([
        ['الكود', 'الحساب', 'مدين', 'دائن'],
        ...trialRows.map(a => [
          a.code, a.nameAr,
          closingDebit(a) / 100, closingCredit(a) / 100,
        ]),
      ], `ميزان-المراجعة-${new Date().toISOString().slice(0, 10)}.csv`);
    } else if (activeTab === 'pl') {
      const revAccounts = accounts.filter(a => a.type === 'revenue' && a.balanceHalalas !== 0);
      const expAccounts = accounts.filter(a => a.type === 'expense' && a.balanceHalalas !== 0);
      downloadCSV([
        ['النوع', 'الكود', 'البند', 'المبلغ (ر.س)'],
        ...revAccounts.map(a => ['إيرادات', a.code, a.nameAr, a.balanceHalalas / 100]),
        ...expAccounts.map(a => ['مصروفات', a.code, a.nameAr, a.balanceHalalas / 100]),
      ], `قائمة-الدخل-${new Date().toISOString().slice(0, 10)}.csv`);
    } else if (activeTab === 'vat') {
      const from = new Date(vatRange.from + 'T00:00:00');
      const to   = new Date(vatRange.to   + 'T23:59:59');
      const filtered = vatInvoices.filter(inv => inv.createdAt >= from && inv.createdAt <= to);
      downloadCSV([
        ['رقم الفاتورة', 'التاريخ', 'مسجل ضريبياً', 'الوعاء الضريبي (ر.س)', 'ضريبة القيمة المضافة (ر.س)', 'الإجمالي (ر.س)'],
        ...filtered.map(inv => [
          inv.invoiceNumber,
          inv.createdAt.toLocaleDateString('ar-SA'),
          inv.isVatRegistered ? 'نعم' : 'لا',
          inv.subtotalExclVat / 100,
          inv.totalVat / 100,
          inv.grandTotal / 100,
        ]),
      ], `الاقرار-الضريبي-${vatRange.from}-${vatRange.to}.csv`);
    } else if (activeTab === 'overview') {
      downloadCSV([
        ['الشهر', 'الحجوزات', 'الإيرادات (ر.س)', 'الضريبة (ر.س)', 'الإجمالي (ر.س)'],
        ...monthly.map(m => [m.nameAr, m.bookings, m.rev / 100, m.vat / 100, m.grandTotal / 100]),
      ], `النظرة-العامة-${year}.csv`);
    } else {
      alert(isAr ? 'سيتوفر التصدير لهذا التقرير قريباً' : 'Export for this report coming soon');
    }
    setShowExport(false);
  }

  const tabs: { id: TabId; labelAr: string; labelEn: string; icon: ReactNode; badge?: string }[] = [
    { id: 'overview', labelAr: 'نظرة عامة',           labelEn: 'Overview',           icon: <BarChart3  size={16} /> },
    { id: 'trial',    labelAr: 'ميزان المراجعة',       labelEn: 'Trial Balance',      icon: <Scale      size={16} /> },
    { id: 'pl',       labelAr: 'قائمة الدخل',          labelEn: 'Income Statement',   icon: <ListTree   size={16} /> },
    { id: 'bs',       labelAr: 'الميزانية العمومية',   labelEn: 'Balance Sheet',      icon: <Building2  size={16} /> },
    { id: 'profit',   labelAr: 'تحليل الربحية',        labelEn: 'Profitability',      icon: <PieChart   size={16} /> },
    { id: 'vat',      labelAr: 'الإقرار الضريبي',      labelEn: 'VAT Return',         icon: <Stamp      size={16} />, badge: 'ZATCA' },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التقارير المالية' : 'Financial Reports'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? 'ميزان المراجعة، قائمة الدخل، الميزانية العمومية، تحليل الربحية، وإقرار ضريبة القيمة المضافة'
              : 'Trial Balance, P&L, Balance Sheet, Profitability Analysis, and ZATCA VAT Return'}
          </p>
        </div>
        <div className="flex items-center gap-2 relative">
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
            <Printer size={14} />{isAr ? 'طباعة' : 'Print'}
          </button>
          <div className="relative">
            <button onClick={() => setShowExport(v => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
              <Download size={14} />
              {isAr ? 'تصدير' : 'Export'}
              <ChevronDown size={13} className={cn('transition-transform', showExport && 'rotate-180')} />
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                <div className="absolute end-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {isAr ? 'تصدير التقرير الحالي' : 'Export Current Report'}
                    </p>
                    <p className="text-xs text-brand-600 font-semibold mt-0.5">
                      {isAr ? tabs.find(t => t.id === activeTab)?.labelAr : tabs.find(t => t.id === activeTab)?.labelEn}
                    </p>
                  </div>
                  <button onClick={handleExportCSV}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <Download size={14} className="text-emerald-600" />
                    {isAr ? 'تصدير Excel / CSV' : 'Export Excel / CSV'}
                  </button>
                  <button onClick={() => { window.print(); setShowExport(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <FileText size={14} className="text-red-500" />
                    {isAr ? 'تصدير PDF (طباعة)' : 'Export PDF (Print)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex items-center gap-1 border-b border-surface-border mb-6 overflow-x-auto pb-px">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex-shrink-0',
                'border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              )}
            >
              {tab.icon}
              {isAr ? tab.labelAr : tab.labelEn}
              {tab.badge && (
                <span className="bg-brand-100 text-brand-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <OverviewTab monthly={monthly} typeMix={typeMix} loading={loadingReports}
            year={year} setYear={setYear} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'trial' && (
          <TrialBalanceTab accounts={accounts} loadingAccounts={loadingAccounts} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'pl' && (
          <IncomeStatementTab accounts={accounts} loadingAccounts={loadingAccounts} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'bs' && (
          <BalanceSheetTab accounts={accounts} loadingAccounts={loadingAccounts} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'profit' && (
          <ProfitabilityTab monthly={monthly} typeMix={typeMix} loading={loadingReports} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'vat' && (
          <VATReturnTab vatInvoices={vatInvoices} loadingVat={loadingReports}
            isAr={isAr} fmtLocale={fmtLocale} vatRange={vatRange} onVatRangeChange={setVatRange} />
        )}
      </div>
    </div>
  );
}
