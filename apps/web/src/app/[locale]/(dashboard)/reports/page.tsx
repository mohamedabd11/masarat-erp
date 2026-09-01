'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { useReportsData, type MonthlyRow, type TypeMixRow } from '@/hooks/useReportsData';
import { useChartOfAccounts, type ChartAccountWithBalance as ChartAccount } from '@/hooks/useChartOfAccounts';
import { useIncomeStatement } from '@/hooks/useIncomeStatement';
import { ArAgingTab } from '@/components/reports/ArAgingTab';
import { TrialBalanceTab } from '@/components/accounting/TrialBalanceTab';
import { UpgradeGate } from '@/components/ui/UpgradeGate';
import {
  rollupAccountAmounts,
  type CoaAmountRow,
  type CoaHierarchyAccount,
  type CoaReportDepth,
} from '@/lib/coa-hierarchy';
import {
  TrendingUp, TrendingDown, BarChart3, Download,
  FileText, CheckCircle2, AlertCircle, Printer,
  ChevronDown, ChevronRight, Receipt, Wallet,
  Building2, Scale, ListTree, Stamp, Calendar,
  PieChart, Users, ChevronLeft,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VatDateRange {
  from: string;
  to: string;
}

interface VatReturnData {
  period: { from: string; to: string };
  sales: { count: number; netAmount: number; vatAmount: number; grossAmount: number };
  creditNotes: { count: number; netAmount: number; vatAmount: number };
  purchases: { count: number; netAmount: number; vatAmount: number };
  summary: {
    standardRatedSales: number;
    zeroRatedSales: number;
    exemptSales: number;
    outputVat: number;
    inputVat: number;
    netVatPayable: number;
  };
  reconciliation: {
    outputVatFromInvoices: number;
    outputVatFromGl: number;
    difference: number;
    reconciled: boolean;
  };
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




const VAT_REPORT_YEAR = new Date().getUTCFullYear();
const VAT_QUICK_PERIODS: { id: string; labelAr: string; labelEn: string; from: string; to: string }[] = [
  { id: 'q1', labelAr: `ر١ ${VAT_REPORT_YEAR}`, labelEn: `Q1 ${VAT_REPORT_YEAR}`, from: `${VAT_REPORT_YEAR}-01-01`, to: `${VAT_REPORT_YEAR}-03-31` },
  { id: 'q2', labelAr: `ر٢ ${VAT_REPORT_YEAR}`, labelEn: `Q2 ${VAT_REPORT_YEAR}`, from: `${VAT_REPORT_YEAR}-04-01`, to: `${VAT_REPORT_YEAR}-06-30` },
  { id: 'q3', labelAr: `ر٣ ${VAT_REPORT_YEAR}`, labelEn: `Q3 ${VAT_REPORT_YEAR}`, from: `${VAT_REPORT_YEAR}-07-01`, to: `${VAT_REPORT_YEAR}-09-30` },
  { id: 'q4', labelAr: `ر٤ ${VAT_REPORT_YEAR}`, labelEn: `Q4 ${VAT_REPORT_YEAR}`, from: `${VAT_REPORT_YEAR}-10-01`, to: `${VAT_REPORT_YEAR}-12-31` },
  { id: 'fy', labelAr: `سنوي ${VAT_REPORT_YEAR}`, labelEn: `FY ${VAT_REPORT_YEAR}`, from: `${VAT_REPORT_YEAR}-01-01`, to: `${VAT_REPORT_YEAR}-12-31` },
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
  // Distribute opening balance to the correct side based on account type
  const debitNormal = a.type === 'asset' || a.type === 'expense';
  const opening = a.openingBalanceHalalas ?? 0;
  return {
    code: a.code,
    nameAr: a.nameAr,
    nameEn: (a.nameEn ?? '') || a.nameAr,
    category: a.type as TrialAccount['category'],
    openDebit:  debitNormal ? opening : 0,
    openCredit: debitNormal ? 0 : opening,
    mvtDebit:  a.debitTotal  ?? 0,
    mvtCredit: a.creditTotal ?? 0,
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
          label={isAr ? 'حجم الأعمال' : 'Gross Bookings'}
          value={formatCurrency(totalRev, fmtLocale)}
          sub={isAr ? 'إجمالي فواتير العملاء قبل الضريبة' : 'Gross customer invoices excl. VAT'} />
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
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'حجم الأعمال الشهري' : 'Monthly Gross Bookings'}</h2>
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
                    { label: isAr ? 'حجم الأعمال (قبل الضريبة)' : 'Gross Bookings (excl. VAT)', align: 'end' },
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

// ─── Income Statement Tab ─────────────────────────────────────────────────────

const QUARTER_OPTS: { value: 0 | 1 | 2 | 3 | 4; ar: string; en: string }[] = [
  { value: 0, ar: 'السنة كاملة', en: 'Full Year' },
  { value: 1, ar: 'ر١ (يناير–مارس)',   en: 'Q1 Jan–Mar' },
  { value: 2, ar: 'ر٢ (أبريل–يونيو)', en: 'Q2 Apr–Jun' },
  { value: 3, ar: 'ر٣ (يوليو–سبتمبر)',en: 'Q3 Jul–Sep' },
  { value: 4, ar: 'ر٤ (أكتوبر–ديسمبر)',en: 'Q4 Oct–Dec' },
];

function IncomeStatementTab({ accounts, isAr, fmtLocale }: { accounts: ChartAccount[]; isAr: boolean; fmtLocale: string }) {
  const {
    revenueLines: directRevenueLines, expenseLines: directExpenseLines,
    totalRevenue, totalExpense,
    grossProfit, netProfit,
    grossMargin, netMargin,
    loading, year, quarter, setYear, setQuarter,
    fromDate, toDate,
  } = useIncomeStatement(accounts);
  const [reportDepth, setReportDepth] = useState<CoaReportDepth>(3);
  const { revenueLines, expenseLines } = useMemo(() => {
    const knownCodes = new Set(accounts.map(account => account.code));
    const hierarchyAccounts: CoaHierarchyAccount[] = [
      ...accounts as CoaHierarchyAccount[],
      ...directRevenueLines.filter(line => !knownCodes.has(line.code)).map(line => ({
        id: `unmapped-revenue-${line.code}`, code: line.code, nameAr: line.nameAr, nameEn: line.nameEn,
        type: 'revenue' as const, parentId: null, level: 1, allowDirectEntry: true,
      })),
      ...directExpenseLines.filter(line => !knownCodes.has(line.code)).map(line => ({
        id: `unmapped-expense-${line.code}`, code: line.code, nameAr: line.nameAr, nameEn: line.nameEn,
        type: 'expense' as const, parentId: null, level: 1, allowDirectEntry: true,
      })),
    ];
    return {
      revenueLines: rollupAccountAmounts(
        hierarchyAccounts,
        new Map(directRevenueLines.map(line => [line.code, line.halalas])),
        reportDepth,
      ).filter(line => line.type === 'revenue').map(line => ({ ...line, halalas: line.amount })),
      expenseLines: rollupAccountAmounts(
        hierarchyAccounts,
        new Map(directExpenseLines.map(line => [line.code, line.halalas])),
        reportDepth,
      ).filter(line => line.type === 'expense').map(line => ({ ...line, halalas: line.amount })),
    };
  }, [accounts, directExpenseLines, directRevenueLines, reportDepth]);

  function handleExport() {
    downloadCSV([
      ['النوع', 'الكود', 'البند', 'المبلغ (ر.س)'],
      ...revenueLines.map(l => ['إيرادات', l.code, l.nameAr, l.halalas / 100]),
      ...expenseLines.map(l => ['مصروفات', l.code, l.nameAr, l.halalas / 100]),
    ], `قائمة-الدخل-${year}${quarter > 0 ? `-Q${quarter}` : ''}.csv`);
  }

  const periodLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString(isAr ? 'ar-SA' : 'en-SA', { year: 'numeric', month: 'short', day: 'numeric' });
    const endDisplay = new Date(toDate.getTime() - 1);
    return `${fmt(fromDate)} — ${fmt(endDisplay)}`;
  })();

  if (loading) return <LoadingPane />;

  return (
    <div className="space-y-5">

      {/* Period selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1 flex-shrink-0">
          <YearNav year={year} setYear={setYear} isAr={isAr} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {QUARTER_OPTS.map(q => (
            <button key={q.value}
              onClick={() => setQuarter(q.value)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                quarter === q.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {isAr ? q.ar : q.en}
            </button>
          ))}
        </div>
        <ReportDepthSelect value={reportDepth} onChange={setReportDepth} isAr={isAr} />
        <span className="text-xs text-slate-400 font-mono ms-auto hidden sm:block">{periodLabel}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={18} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
          value={formatCurrency(totalRevenue, fmtLocale)} />
        <KpiCard icon={<TrendingDown size={18} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'إجمالي المصروفات' : 'Total Expenses'}
          value={formatCurrency(totalExpense, fmtLocale)} />
        <KpiCard
          icon={<Wallet size={18} />}
          iconBg={grossProfit >= 0 ? 'bg-sky-50' : 'bg-red-50'}
          iconColor={grossProfit >= 0 ? 'text-sky-600' : 'text-red-600'}
          label={isAr ? 'مجمل الربح' : 'Gross Profit'}
          value={formatCurrency(Math.abs(grossProfit), fmtLocale)}
          sub={`${grossMargin >= 0 ? '+' : '-'}${Math.abs(grossMargin)}% ${isAr ? 'هامش' : 'margin'}`} />
        <KpiCard
          icon={<Scale size={18} />}
          iconBg={netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          iconColor={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
          label={isAr ? 'صافي الربح' : 'Net Profit'}
          value={formatCurrency(Math.abs(netProfit), fmtLocale)}
          sub={`${netMargin >= 0 ? '+' : '-'}${Math.abs(netMargin)}% ${isAr ? 'هامش صافي' : 'net margin'}`} />
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'قائمة الدخل (الأرباح والخسائر)' : 'Income Statement (Profit & Loss)'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{isAr ? `من القيود المحاسبية · ${periodLabel}` : `From journal entries · ${periodLabel}`}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExport}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              <Download size={13} />{isAr ? 'تصدير CSV' : 'Export CSV'}
            </button>
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              <Printer size={13} />{isAr ? 'طباعة' : 'Print'}
            </button>
          </div>
        </div>

        {revenueLines.length === 0 && expenseLines.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">
            {isAr ? 'لا توجد قيود إيرادات أو مصروفات في هذه الفترة' : 'No revenue or expense entries in this period'}
          </p>
        ) : (
          <div className="divide-y divide-surface-border">

            {/* Revenue */}
            <div>
              <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-100">
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
                  {isAr ? 'الإيرادات' : 'REVENUE'}
                </span>
              </div>
              {revenueLines.map(l => (
                <div key={l.code} className={cn('flex items-center justify-between px-6 py-3 hover:bg-slate-50/60 transition-colors', l.isSummary && 'bg-slate-50/60 font-semibold')}>
                  <span className="text-sm text-slate-600 flex items-center gap-2" style={{ paddingInlineStart: `${16 + Math.max(0, l.level - 1) * 16}px` }}>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{l.code}</span>
                    {isAr ? l.nameAr : l.nameEn}
                  </span>
                  <span className="tabular-nums font-mono text-sm font-semibold text-slate-800">
                    {formatCurrency(l.halalas, fmtLocale)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-6 py-3 bg-emerald-50/40">
                <span className="text-sm font-bold text-slate-900 ps-4">{isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}</span>
                <span className="tabular-nums font-mono text-sm font-black text-emerald-700">{formatCurrency(totalRevenue, fmtLocale)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div>
              <div className="px-6 py-2 bg-amber-50 border-b border-amber-100">
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                  {isAr ? 'المصروفات' : 'EXPENSES'}
                </span>
              </div>
              {expenseLines.map(l => (
                <div key={l.code} className={cn('flex items-center justify-between px-6 py-3 hover:bg-slate-50/60 transition-colors', l.isSummary && 'bg-slate-50/60 font-semibold')}>
                  <span className="text-sm text-slate-600 flex items-center gap-2" style={{ paddingInlineStart: `${16 + Math.max(0, l.level - 1) * 16}px` }}>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{l.code}</span>
                    {isAr ? l.nameAr : l.nameEn}
                  </span>
                  <span className="tabular-nums font-mono text-sm font-semibold text-red-600">
                    ({formatCurrency(l.halalas, fmtLocale)})
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-6 py-3 bg-amber-50/40">
                <span className="text-sm font-bold text-slate-900 ps-4">{isAr ? 'إجمالي المصروفات' : 'Total Expenses'}</span>
                <span className="tabular-nums font-mono text-sm font-black text-red-600">({formatCurrency(totalExpense, fmtLocale)})</span>
              </div>
            </div>

            {/* Gross Profit line */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-sky-50/60">
              <span className="text-sm font-bold text-sky-800 ps-4">{isAr ? 'مجمل الربح (الإيرادات − تكلفة الخدمات)' : 'Gross Profit (Revenue − Cost of Services)'}</span>
              <span className={cn('tabular-nums font-mono text-sm font-black', grossProfit >= 0 ? 'text-sky-700' : 'text-red-700')}>
                {grossProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(grossProfit), fmtLocale)}{grossProfit < 0 ? ')' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Net Profit footer */}
        <div className={cn('px-6 py-5 border-t-2 flex items-center justify-between',
          netProfit >= 0 ? 'bg-gradient-to-r from-emerald-50 to-white border-emerald-300' : 'bg-gradient-to-r from-red-50 to-white border-red-300')}>
          <div>
            <p className={cn('text-[11px] font-black uppercase tracking-widest mb-1', netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {isAr ? 'صافي الربح النهائي' : 'NET PROFIT / (LOSS)'}
            </p>
            <p className={cn('text-xs', netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {netMargin >= 0 ? '+' : ''}{netMargin}% {isAr ? 'هامش الربح الصافي' : 'net profit margin'}
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

const VAT_RATE_BADGES: Record<string, string> = {
  '15%': 'bg-red-100 text-red-700',
  '0%': 'bg-sky-100 text-sky-700',
  exempt: 'bg-slate-100 text-slate-500',
};

function VATBoxRow({ box, isAr, fmtLocale }: { box: VATBoxDef; isAr: boolean; fmtLocale: string }) {
  const rateBadge = box.rate ? (VAT_RATE_BADGES[box.rate] ?? '') : '';
  const dotColor = box.highlight === 'output' ? 'bg-brand-600' : box.highlight === 'input' ? 'bg-sky-600' : 'bg-emerald-600';
  return (
    <div className="border-b border-slate-100 last:border-0 p-4">
      <div className="flex items-start gap-3">
        <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 text-white', dotColor)}>{box.box}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-slate-900 flex-1">{isAr ? box.labelAr : box.labelEn}</p>
            {box.rate ? <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0', rateBadge)}>{box.rate}</span> : null}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{isAr ? box.noteAr : box.noteEn}</p>
          <div className="flex items-center gap-6 pt-2 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{isAr ? 'الوعاء الضريبي' : 'Tax Base'}</p>
              <p className="text-sm font-mono tabular-nums font-semibold text-slate-700">{box.base !== 0 ? formatCurrency(box.base, fmtLocale) : <span className="text-slate-300">—</span>}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{isAr ? 'مبلغ الضريبة' : 'VAT Amount'}</p>
              <p className={cn('text-sm font-mono tabular-nums font-bold', box.box === '13' ? 'text-emerald-700 text-base' : 'text-slate-900')}>
                {box.vat !== 0 ? formatCurrency(box.vat, fmtLocale) : <span className="text-slate-300">—</span>}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportDepthSelect({ value, onChange, isAr }: {
  value: CoaReportDepth;
  onChange: (value: CoaReportDepth) => void;
  isAr: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
      <span>{isAr ? 'مستوى العرض' : 'Display depth'}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value === 'all' ? 'all' : Number(event.target.value) as 3 | 4)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="3">{isAr ? 'المستوى 3 — قوائم' : 'Level 3 — statements'}</option>
        <option value="4">{isAr ? 'المستوى 4 — إداري' : 'Level 4 — management'}</option>
        <option value="all">{isAr ? 'كل المستويات — تفصيلي' : 'All levels — detailed'}</option>
      </select>
    </label>
  );
}

function VATSection({ title, boxes, accentBg, accentBorder, isAr, fmtLocale }: {
  title: string;
  boxes: VATBoxDef[];
  accentBg: string;
  accentBorder: string;
  isAr: boolean;
  fmtLocale: string;
}) {
  return (
    <div className={cn('rounded-xl border overflow-hidden', accentBorder)}>
      <div className={cn('px-5 py-3', accentBg)}><h3 className="text-xs font-black uppercase tracking-widest text-slate-700">{title}</h3></div>
      {boxes.map((box) => <VATBoxRow key={box.box} box={box} isAr={isAr} fmtLocale={fmtLocale} />)}
    </div>
  );
}

// ─── VAT Return Tab ───────────────────────────────────────────────────────────

function VATReturnTab({ isAr, fmtLocale, vatRange, onVatRangeChange }: {
  isAr: boolean; fmtLocale: string;
  vatRange: VatDateRange; onVatRangeChange: (r: VatDateRange) => void;
}) {
  const [data, setData] = useState<VatReturnData | null>(null);
  const [loadingVat, setLoadingVat] = useState(true);
  const [vatError, setVatError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingVat(true);
    setVatError('');
    apiFetch<VatReturnData & { error?: string }>(`/api/reports/vat-return?from=${vatRange.from}&to=${vatRange.to}`)
      .then((response) => {
        if (cancelled) return;
        if (response.error) throw new Error(response.error);
        setData(response);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setData(null);
          setVatError(error instanceof Error ? error.message : (isAr ? 'تعذّر تحميل التقرير' : 'Failed to load report'));
        }
      })
      .finally(() => { if (!cancelled) setLoadingVat(false); });
    return () => { cancelled = true; };
  }, [vatRange.from, vatRange.to, isAr]);

  const standardBase = data?.summary.standardRatedSales ?? 0;
  const standardVat = data?.summary.outputVat ?? 0;
  const zeroBase = data?.summary.zeroRatedSales ?? 0;
  const exemptBase = data?.summary.exemptSales ?? 0;
  const inputVat = data?.summary.inputVat ?? 0;
  const totalBase = standardBase + zeroBase + exemptBase;
  const totalVat = standardVat;
  const netVat = data?.summary.netVatPayable ?? 0;

  const activePreset = VAT_QUICK_PERIODS.find(p => p.from === vatRange.from && p.to === vatRange.to);

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
    { box: '7', highlight: 'input',
      labelAr: 'ضريبة المدخلات القابلة للاسترداد',
      labelEn: 'Deductible Input VAT',
      noteAr: 'صافي حركة حساب ضريبة المدخلات 1230 بعد العكس',
      noteEn: 'Net movement on input VAT account 1230 after reversals',
      base: 0, vat: inputVat },
    { box: '13', highlight: 'net-due',
      labelAr: 'صافي الضريبة المستحقة',
      labelEn: 'Net VAT Due',
      noteAr: 'المبلغ المستحق للدفع لهيئة الزكاة والضريبة والجمارك',
      noteEn: 'Amount payable to ZATCA',
      base: 0, vat: netVat },
  ];

  const outputBoxes = vatBoxes.filter(b => b.highlight === 'output');
  const inputBoxes  = vatBoxes.filter(b => b.highlight === 'input');
  const netBoxes    = vatBoxes.filter(b => b.highlight === 'net-due');

  if (loadingVat) return <LoadingPane />;
  if (vatError) return <Card><p className="text-red-600 text-sm py-6 text-center">{vatError}</p></Card>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-brand-700">
          <Stamp size={20} />
          <div>
            <p className="font-black text-base">{isAr ? 'إقرار ضريبة القيمة المضافة' : 'VAT Return — ZATCA'}</p>
            <p className="text-xs text-brand-600">{isAr ? 'مسودة مراجعة من دفتر الحسابات' : 'Ledger-based review draft'}</p>
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

      {!data.reconciliation.reconciled && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">{isAr ? 'يوجد فرق يحتاج مراجعة قبل اعتماد الإقرار' : 'A difference requires review before filing'}</p>
            <p className="text-xs mt-0.5">
              {isAr ? 'الفرق بين الفواتير ودفتر الحسابات: ' : 'Invoice-to-ledger difference: '}
              {formatCurrency(data.reconciliation.difference, fmtLocale)}
            </p>
          </div>
        </div>
      )}

      <VATSection title={isAr ? 'القسم الأول — المبيعات وضريبة المخرجات' : 'Part I — Sales & Output VAT'}
        boxes={outputBoxes} accentBg="bg-brand-50" accentBorder="border-brand-200" isAr={isAr} fmtLocale={fmtLocale} />

      <VATSection title={isAr ? 'القسم الثاني — المشتريات وضريبة المدخلات' : 'Part II — Purchases & Input VAT'}
        boxes={inputBoxes} accentBg="bg-sky-50" accentBorder="border-sky-200" isAr={isAr} fmtLocale={fmtLocale} />

      <VATSection title={isAr ? 'القسم الثالث — صافي الضريبة المستحقة' : 'Part III — Net VAT Due'}
        boxes={netBoxes} accentBg="bg-emerald-50" accentBorder="border-emerald-200" isAr={isAr} fmtLocale={fmtLocale} />

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
          <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-3">
            <span className="text-slate-600">{isAr ? 'صافي ضريبة المدخلات' : 'Net Input VAT'}</span>
            <span className="font-bold font-mono tabular-nums text-sky-700">{formatCurrency(inputVat, fmtLocale)}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-black text-slate-900">{isAr ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span>
            <span className="text-xl font-black text-emerald-700 tabular-nums font-mono">
              {formatCurrency(netVat, fmtLocale)}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <AlertCircle size={18} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">
            {isAr
              ? 'هذه مسودة مراجعة مبنية على دفتر الحسابات. لا ترسل أي بيانات إلى هيئة الزكاة تلقائياً، ويجب اعتمادها من المحاسب قبل التقديم.'
              : 'This is a ledger-based review draft. It does not submit anything to ZATCA and must be approved by the accountant before filing.'}
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── Balance Sheet Tab ────────────────────────────────────────────────────────

function BalanceSheetAccountRow({ account, isAr, fmtLocale }: {
  account: CoaAmountRow;
  isAr: boolean;
  fmtLocale: string;
}) {
  return (
    <div className={cn('flex items-center justify-between px-5 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/40 transition-colors', account.isSummary && 'bg-slate-50/60 font-semibold')}>
      <span className="text-sm text-slate-700 flex items-center gap-2" style={{ paddingInlineStart: `${Math.max(0, account.level - 1) * 16}px` }}>
        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{account.code}</span>
        {isAr ? account.nameAr : (account.nameEn || account.nameAr)}
      </span>
      <span className="text-sm font-mono tabular-nums text-slate-800">{formatCurrency(account.amount, fmtLocale)}</span>
    </div>
  );
}

function BalanceSheetTab({ accounts, loadingAccounts, isAr, fmtLocale }: {
  accounts: ChartAccount[]; loadingAccounts: boolean; isAr: boolean; fmtLocale: string;
}) {
  const [reportDepth, setReportDepth] = useState<CoaReportDepth>(3);
  const { directAssetAccounts, directLiabilityAccounts, directEquityAccounts,
          totalAssets, totalLiabilities, totalEquity, netProfit } = useMemo(() => {
    const directAssetAccounts     = accounts.filter(a => a.type === 'asset'     && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const directLiabilityAccounts = accounts.filter(a => a.type === 'liability' && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const directEquityAccounts    = accounts.filter(a => a.type === 'equity'    && a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const revenueAccounts   = accounts.filter(a => a.type === 'revenue');
    const expenseAccounts   = accounts.filter(a => a.type === 'expense');
    const totalAssets       = directAssetAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalLiabilities  = directLiabilityAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalEquity       = directEquityAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalRevenue      = revenueAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const totalExpense      = expenseAccounts.reduce((s, a) => s + a.balanceHalalas, 0);
    const netProfit         = totalRevenue - totalExpense;
    return { directAssetAccounts, directLiabilityAccounts, directEquityAccounts,
             totalAssets, totalLiabilities, totalEquity, netProfit };
  }, [accounts]);

  const { assetAccounts, liabilityAccounts, equityAccounts } = useMemo(() => {
    const hierarchyAccounts = accounts as CoaHierarchyAccount[];
    const project = (type: 'asset' | 'liability' | 'equity', direct: ChartAccount[]) => rollupAccountAmounts(
      hierarchyAccounts,
      new Map(direct.map(account => [account.code, account.balanceHalalas])),
      reportDepth,
    ).filter(account => account.type === type);
    return {
      assetAccounts: project('asset', directAssetAccounts),
      liabilityAccounts: project('liability', directLiabilityAccounts),
      equityAccounts: project('equity', directEquityAccounts),
    };
  }, [accounts, directAssetAccounts, directEquityAccounts, directLiabilityAccounts, reportDepth]);

  const totalLiabEquity = totalLiabilities + totalEquity + netProfit;
  const balanced = Math.abs(totalAssets - totalLiabEquity) < 1;

  if (loadingAccounts) return <LoadingPane />;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ReportDepthSelect value={reportDepth} onChange={setReportDepth} isAr={isAr} />
      </div>
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
                assetAccounts.map(account => <BalanceSheetAccountRow key={account.id} account={account} isAr={isAr} fmtLocale={fmtLocale} />)
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
                liabilityAccounts.map(account => <BalanceSheetAccountRow key={account.id} account={account} isAr={isAr} fmtLocale={fmtLocale} />)
              )}
            </Card>

            <Card padding="none">
              <div className="px-5 py-3 border-b bg-purple-50 border-purple-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-purple-700">{isAr ? 'حقوق الملكية' : 'Equity'}</h3>
                <span className="text-sm font-extrabold tabular-nums text-purple-700">{formatCurrency(totalEquity + netProfit, fmtLocale)}</span>
              </div>
              {equityAccounts.map(account => <BalanceSheetAccountRow key={account.id} account={account} isAr={isAr} fmtLocale={fmtLocale} />)}
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
          label={isAr ? 'حجم الأعمال' : 'Gross Bookings'} value={formatCurrency(totalRev, fmtLocale)} />
        <KpiCard icon={<Receipt size={20} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'ضريبة محصّلة' : 'VAT Collected'} value={formatCurrency(totalVat, fmtLocale)} />
        <KpiCard icon={<Wallet size={20} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label={isAr ? 'عدد الخدمات' : 'Service Types'} value={typeMix.length} />
        <KpiCard icon={<Users size={20} />} iconBg="bg-purple-50" iconColor="text-purple-600"
          label={isAr ? 'عدد الأنواع' : 'Service Types'} value={typeMix.length} />
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

        {/* Bookings by agent — empty state until real data exists */}
        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-4">{isAr ? 'أداء الموظفين' : 'Agent Performance'}</h2>
          <p className="text-sm text-slate-400 text-center py-8">{isAr ? 'ستظهر البيانات بعد إضافة حجوزات' : 'Data will appear after adding bookings'}</p>
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

      {/* Top Customers — empty state until real data exists */}
      <Card>
        <h2 className="text-base font-semibold text-slate-900 mb-4">{isAr ? 'أفضل العملاء' : 'Top Customers'}</h2>
        <p className="text-sm text-slate-400 text-center py-8">{isAr ? 'ستظهر البيانات بعد إضافة حجوزات' : 'Data will appear after adding bookings'}</p>
      </Card>
    </div>
  );
}

// ─── Booking Profitability Tab ────────────────────────────────────────────────

interface ProfitRow {
  groupKey:     string;
  label:        string;
  bookingCount: number;
  totalRevenue: number;
  totalCost:    number;
  totalProfit:  number;
  marginPct:    number;
}

interface ProfitTotals {
  totalRevenue: number;
  totalCost:    number;
  totalProfit:  number;
  marginPct:    number;
}

function BookingProfitabilityTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const [groupBy, setGroupBy] = useState<'serviceType' | 'employee' | 'month' | 'booking'>('serviceType');
  const [rows,    setRows]    = useState<ProfitRow[]>([]);
  const [totals,  setTotals]  = useState<ProfitTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    setLoading(true);
    setErr('');
    apiFetch<{ rows: ProfitRow[]; totals: ProfitTotals }>(`/api/reports/booking-profitability?groupBy=${groupBy}`)
      .then((d) => {
        setRows(d.rows ?? []);
        setTotals(d.totals ?? null);
      })
      .catch(() => setErr(isAr ? 'تعذّر تحميل البيانات' : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [groupBy, isAr]);

  const GROUP_OPTIONS = [
    { id: 'serviceType' as const, labelAr: 'نوع الخدمة', labelEn: 'Service Type' },
    { id: 'employee'   as const, labelAr: 'الموظف',      labelEn: 'Employee' },
    { id: 'month'      as const, labelAr: 'الشهر',       labelEn: 'Month' },
    { id: 'booking'    as const, labelAr: 'الحجز',       labelEn: 'Booking' },
  ];

  return (
    <div className="space-y-5">
      {/* Group-by selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-600">{isAr ? 'التجميع حسب:' : 'Group by:'}</span>
        {GROUP_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => setGroupBy(opt.id)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors',
              groupBy === opt.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            {isAr ? opt.labelAr : opt.labelEn}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingPane />
      ) : err ? (
        <Card><p className="text-red-600 text-sm py-4 text-center">{err}</p></Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400 text-center py-10">
            {isAr ? 'لا توجد بيانات حجوزات بعد' : 'No booking data yet'}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pe-4 text-start">{isAr ? 'التصنيف' : 'Group'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الحجوزات' : 'Bookings'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الإيرادات' : 'Revenue'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'التكلفة' : 'Cost'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الربح الإجمالي' : 'Gross Profit'}</th>
                  <th className="py-3 ps-3 text-end">{isAr ? 'الهامش' : 'Margin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.groupKey} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 pe-4 font-medium text-slate-800">{r.label || r.groupKey}</td>
                    <td className="py-3 px-3 text-end text-slate-600 tabular-nums">{r.bookingCount}</td>
                    <td className="py-3 px-3 text-end text-slate-700 tabular-nums font-medium">{formatCurrency(r.totalRevenue, fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-slate-500 tabular-nums">{formatCurrency(r.totalCost, fmtLocale)}</td>
                    <td className={cn('py-3 px-3 text-end tabular-nums font-semibold', r.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                      {r.totalProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(r.totalProfit), fmtLocale)}{r.totalProfit < 0 ? ')' : ''}
                    </td>
                    <td className="py-3 ps-3 text-end">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        r.marginPct >= 20 ? 'bg-emerald-50 text-emerald-700' :
                        r.marginPct >= 0  ? 'bg-amber-50 text-amber-700' :
                                            'bg-red-50 text-red-600',
                      )}>
                        {r.marginPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td className="py-3 pe-4 text-slate-800">{isAr ? 'الإجمالي' : 'Total'}</td>
                    <td className="py-3 px-3 text-end text-slate-600 tabular-nums">
                      {rows.reduce((s, r) => s + r.bookingCount, 0)}
                    </td>
                    <td className="py-3 px-3 text-end text-slate-700 tabular-nums">{formatCurrency(totals.totalRevenue, fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-slate-500 tabular-nums">{formatCurrency(totals.totalCost, fmtLocale)}</td>
                    <td className={cn('py-3 px-3 text-end tabular-nums', totals.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                      {totals.totalProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(totals.totalProfit), fmtLocale)}{totals.totalProfit < 0 ? ')' : ''}
                    </td>
                    <td className="py-3 ps-3 text-end">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        totals.marginPct >= 20 ? 'bg-emerald-100 text-emerald-700' :
                        totals.marginPct >= 0  ? 'bg-amber-100 text-amber-700' :
                                                  'bg-red-100 text-red-600',
                      )}>
                        {totals.marginPct}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Supplier Profitability Tab ───────────────────────────────────────────────

interface SupplierProfitRow {
  supplierId:   string;
  supplierName: string;
  paymentCount: number;
  bookingCount: number;
  totalRevenue: number;
  totalCost:    number;
  totalProfit:  number;
  marginPct:    number;
}

function SupplierProfitabilityTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const [rows,    setRows]    = useState<SupplierProfitRow[]>([]);
  const [totals,  setTotals]  = useState<ProfitTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    apiFetch<{ rows: SupplierProfitRow[]; totals: ProfitTotals }>('/api/reports/supplier-profitability')
      .then((d) => {
        setRows(d.rows ?? []);
        setTotals(d.totals ?? null);
      })
      .catch(() => setErr(isAr ? 'تعذّر تحميل البيانات' : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [isAr]);

  return (
    <div className="space-y-5">
      {loading ? (
        <LoadingPane />
      ) : err ? (
        <Card><p className="text-red-600 text-sm py-4 text-center">{err}</p></Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400 text-center py-10">
            {isAr ? 'لا توجد مدفوعات موردين بعد' : 'No supplier payments yet'}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pe-4 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الدفعات' : 'Payments'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الحجوزات' : 'Bookings'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الإيرادات' : 'Revenue'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'التكلفة' : 'Cost'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'الربح' : 'Profit'}</th>
                  <th className="py-3 ps-3 text-end">{isAr ? 'الهامش' : 'Margin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.supplierId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 pe-4 font-medium text-slate-800">{r.supplierName}</td>
                    <td className="py-3 px-3 text-end text-slate-500 tabular-nums">{r.paymentCount}</td>
                    <td className="py-3 px-3 text-end text-slate-500 tabular-nums">{r.bookingCount}</td>
                    <td className="py-3 px-3 text-end text-slate-700 tabular-nums font-medium">{formatCurrency(r.totalRevenue, fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-slate-500 tabular-nums">{formatCurrency(r.totalCost, fmtLocale)}</td>
                    <td className={cn('py-3 px-3 text-end tabular-nums font-semibold', r.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                      {r.totalProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(r.totalProfit), fmtLocale)}{r.totalProfit < 0 ? ')' : ''}
                    </td>
                    <td className="py-3 ps-3 text-end">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        r.marginPct >= 20 ? 'bg-emerald-50 text-emerald-700' :
                        r.marginPct >= 0  ? 'bg-amber-50 text-amber-700' :
                                            'bg-red-50 text-red-600',
                      )}>
                        {r.marginPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td className="py-3 pe-4 text-slate-800" colSpan={3}>{isAr ? 'الإجمالي' : 'Total'}</td>
                    <td className="py-3 px-3 text-end text-slate-700 tabular-nums">{formatCurrency(totals.totalRevenue, fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-slate-500 tabular-nums">{formatCurrency(totals.totalCost, fmtLocale)}</td>
                    <td className={cn('py-3 px-3 text-end tabular-nums', totals.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                      {totals.totalProfit < 0 ? '(' : ''}{formatCurrency(Math.abs(totals.totalProfit), fmtLocale)}{totals.totalProfit < 0 ? ')' : ''}
                    </td>
                    <td className="py-3 ps-3 text-end">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        totals.marginPct >= 20 ? 'bg-emerald-100 text-emerald-700' :
                        totals.marginPct >= 0  ? 'bg-amber-100 text-amber-700' :
                                                  'bg-red-100 text-red-600',
                      )}>
                        {totals.marginPct}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Cash Flow Tab ────────────────────────────────────────────────────────────

interface CfAdjustment { labelAr: string; labelEn: string; amount: number }
interface CfLine       { code: string; nameAr: string; nameEn: string; amount: number }

interface CashFlowData {
  period:   { from: string; to: string };
  operating: { netIncome: number; adjustments: CfAdjustment[]; total: number };
  investing: { lines: CfLine[]; total: number };
  financing: { lines: CfLine[]; total: number };
  netCashChange:     number;
  cashAndBankChange: number;
  isReconciled:      boolean;
}

function CashFlowTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const currentYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${currentYear}-01-01`);
  const [to,   setTo]   = useState(`${currentYear}-12-31`);
  const [data,    setData]    = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  function load() {
    setLoading(true);
    setErr('');
    apiFetch<CashFlowData & { error?: string }>(`/api/reports/cash-flow?from=${from}&to=${to}`)
      .then((d) => {
        if (d.error) { setErr(d.error); return; }
        if (!d.operating) { setErr(isAr ? 'استجابة غير صالحة من الخادم' : 'Invalid server response'); return; }
        setData(d);
      })
      .catch(() => setErr(isAr ? 'تعذّر تحميل البيانات' : 'Failed to load data'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function SectionHeader({ title, total, color }: { title: string; total: number; color: string }) {
    return (
      <div className={`flex items-center justify-between px-5 py-3 ${color} border-b`}>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h3>
        <span className={`text-base font-black tabular-nums ${total >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          {total < 0 ? '(' : ''}{formatCurrency(Math.abs(total), fmtLocale)}{total < 0 ? ')' : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date range controls */}
      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">{isAr ? 'من' : 'From'}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">{isAr ? 'إلى' : 'To'}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50">
            {loading ? '...' : (isAr ? 'تحديث' : 'Refresh')}
          </button>
        </div>
      </Card>

      {err && <Card><p className="text-red-600 text-sm py-4 text-center">{err}</p></Card>}
      {loading && <LoadingPane />}

      {!loading && data && (
        <div className="space-y-4">
          {/* Operating */}
          <Card padding="none" className="overflow-hidden">
            <SectionHeader
              title={isAr ? 'أ. التدفقات النقدية من الأنشطة التشغيلية' : 'A. Cash Flows from Operating Activities'}
              total={data.operating.total} color="bg-brand-50" />
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between px-5 py-3 text-sm">
                <span className="text-slate-700 font-medium">{isAr ? 'صافي الدخل' : 'Net Income'}</span>
                <span className={`tabular-nums font-bold ${data.operating.netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatCurrency(data.operating.netIncome, fmtLocale)}
                </span>
              </div>
              {data.operating.adjustments.filter(a => a.amount !== 0).map((a, i) => (
                <div key={i} className="flex justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-600">{isAr ? a.labelAr : a.labelEn}</span>
                  <span className={`tabular-nums ${a.amount >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                    {a.amount >= 0 ? '+' : ''}{formatCurrency(a.amount, fmtLocale)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Investing */}
          <Card padding="none" className="overflow-hidden">
            <SectionHeader
              title={isAr ? 'ب. التدفقات النقدية من الأنشطة الاستثمارية' : 'B. Cash Flows from Investing Activities'}
              total={data.investing.total} color="bg-amber-50" />
            {data.investing.lines.length === 0
              ? <p className="px-5 py-4 text-sm text-slate-400">{isAr ? 'لا توجد حركات استثمارية' : 'No investing activity'}</p>
              : <div className="divide-y divide-slate-100">
                  {data.investing.lines.map((l, i) => (
                    <div key={i} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-slate-600">{isAr ? l.nameAr : l.nameEn} <span className="text-slate-400 text-xs">{l.code}</span></span>
                      <span className={`tabular-nums ${l.amount >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                        {l.amount >= 0 ? '+' : ''}{formatCurrency(l.amount, fmtLocale)}
                      </span>
                    </div>
                  ))}
                </div>}
          </Card>

          {/* Financing */}
          <Card padding="none" className="overflow-hidden">
            <SectionHeader
              title={isAr ? 'ج. التدفقات النقدية من الأنشطة التمويلية' : 'C. Cash Flows from Financing Activities'}
              total={data.financing.total} color="bg-purple-50" />
            {data.financing.lines.length === 0
              ? <p className="px-5 py-4 text-sm text-slate-400">{isAr ? 'لا توجد حركات تمويلية' : 'No financing activity'}</p>
              : <div className="divide-y divide-slate-100">
                  {data.financing.lines.map((l, i) => (
                    <div key={i} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-slate-600">{isAr ? l.nameAr : l.nameEn} <span className="text-slate-400 text-xs">{l.code}</span></span>
                      <span className={`tabular-nums ${l.amount >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                        {l.amount >= 0 ? '+' : ''}{formatCurrency(l.amount, fmtLocale)}
                      </span>
                    </div>
                  ))}
                </div>}
          </Card>

          {/* Net change */}
          <Card className={`border-2 ${data.isReconciled ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                  {isAr ? 'صافي التغير في النقدية' : 'Net Change in Cash'}
                </p>
                <p className="text-xs text-slate-400">
                  {data.isReconciled
                    ? (isAr ? 'متوازن — يطابق حركة النقدية الفعلية' : 'Balanced — matches actual cash movement')
                    : (isAr ? 'فرق صغير بسبب تقريب أو قيود غير مصنفة' : 'Minor difference due to rounding or unclassified entries')}
                </p>
              </div>
              <p className={`text-2xl font-black tabular-nums ${data.netCashChange >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {data.netCashChange < 0 ? '(' : ''}{formatCurrency(Math.abs(data.netCashChange), fmtLocale)}{data.netCashChange < 0 ? ')' : ''}
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Supplier Aging Tab ───────────────────────────────────────────────────────

interface SupplierAgingRow {
  supplierId:   string;
  supplierName: string;
  supplierType: string;
  current:      number;
  days31_60:    number;
  days61_90:    number;
  days91plus:   number;
  unallocated:  number;
  total:        number;
}

interface AgingTotals {
  current:    number;
  days31_60:  number;
  days61_90:  number;
  days91plus: number;
  unallocated: number;
  total:      number;
}

interface SupplierAgingReconciliation {
  supplierBalanceTotal: number;
  apGlBalance: number;
  difference: number;
  reconciled: boolean;
  balanceSnapshotDate: string;
  historicalSnapshotAvailable: boolean;
}

function SupplierAgingTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const today   = new Date().toISOString().slice(0, 10);
  const [asOf,    setAsOf]    = useState(today);
  const [rows,    setRows]    = useState<SupplierAgingRow[]>([]);
  const [totals,  setTotals]  = useState<AgingTotals | null>(null);
  const [reconciliation, setReconciliation] = useState<SupplierAgingReconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  function load() {
    setLoading(true);
    setErr('');
    apiFetch<{ rows: SupplierAgingRow[]; totals: AgingTotals; reconciliation: SupplierAgingReconciliation; error?: string }>(`/api/reports/supplier-aging?asOf=${asOf}`)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setRows(d.rows ?? []);
        setTotals(d.totals ?? null);
        setReconciliation(d.reconciliation ?? null);
      })
      .catch((error: unknown) => setErr(error instanceof Error ? error.message : (isAr ? 'تعذّر تحميل البيانات' : 'Failed to load data')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <Card padding="sm">
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">{isAr ? 'كما في تاريخ' : 'As of Date'}</label>
            <input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50">
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </Card>

      {err    && <Card><p className="text-red-600 text-sm py-4 text-center">{err}</p></Card>}
      {loading && <LoadingPane />}

      {!loading && reconciliation && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${reconciliation.reconciled ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
          {reconciliation.reconciled ? <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-bold">
              {reconciliation.reconciled
                ? (isAr ? 'تفاصيل الموردين مطابقة لدفتر الحسابات' : 'Supplier detail reconciles to the general ledger')
                : (isAr ? 'يوجد فرق يحتاج مراجعة في ذمم الموردين' : 'Supplier payables require reconciliation review')}
            </p>
            <p className="text-xs mt-0.5">
              {isAr ? 'رصيد الحساب 2000: ' : 'GL 2000 balance: '}{formatCurrency(reconciliation.apGlBalance, fmtLocale)}
              {' · '}{isAr ? 'الفرق: ' : 'Difference: '}{formatCurrency(reconciliation.difference, fmtLocale)}
            </p>
            {!reconciliation.historicalSnapshotAvailable && (
              <p className="text-xs mt-1 font-semibold">
                {isAr
                  ? `أرصدة الموردين التفصيلية محفوظة بتاريخ ${reconciliation.balanceSnapshotDate}؛ التاريخ السابق تقريبي حتى إضافة سجل تاريخي للمورد.`
                  : `Supplier detail is snapshotted at ${reconciliation.balanceSnapshotDate}; prior-date detail is approximate until supplier history is added.`}
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && !err && (
        <Card><p className="text-sm text-slate-400 text-center py-10">{isAr ? 'لا توجد ذمم دائنة مستحقة' : 'No outstanding AP balances'}</p></Card>
      )}

      {!loading && rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pe-4 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'جاري (0-30)' : 'Current (0-30d)'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? '31-60 يوم' : '31-60 days'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? '61-90 يوم' : '61-90 days'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? '+90 يوم' : '90+ days'}</th>
                  <th className="py-3 px-3 text-end">{isAr ? 'غير موزع' : 'Unallocated'}</th>
                  <th className="py-3 ps-3 text-end">{isAr ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.supplierId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 pe-4 font-medium text-slate-800">{r.supplierName}</td>
                    <td className="py-3 px-3 text-end text-slate-700 tabular-nums">{r.current > 0 ? formatCurrency(r.current, fmtLocale) : '—'}</td>
                    <td className="py-3 px-3 text-end tabular-nums">{r.days31_60  > 0 ? <span className="text-amber-600 font-medium">{formatCurrency(r.days31_60,  fmtLocale)}</span> : '—'}</td>
                    <td className="py-3 px-3 text-end tabular-nums">{r.days61_90  > 0 ? <span className="text-orange-600 font-medium">{formatCurrency(r.days61_90,  fmtLocale)}</span> : '—'}</td>
                    <td className="py-3 px-3 text-end tabular-nums">{r.days91plus > 0 ? <span className="text-red-600 font-bold">{formatCurrency(r.days91plus, fmtLocale)}</span> : '—'}</td>
                    <td className="py-3 px-3 text-end tabular-nums">{r.unallocated > 0 ? <span className="text-purple-600 font-bold">{formatCurrency(r.unallocated, fmtLocale)}</span> : '—'}</td>
                    <td className="py-3 ps-3 text-end font-bold text-slate-900 tabular-nums">{formatCurrency(r.total, fmtLocale)}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td className="py-3 pe-4 text-slate-800">{isAr ? 'الإجمالي' : 'Total'}</td>
                    <td className="py-3 px-3 text-end text-slate-700 tabular-nums">{formatCurrency(totals.current,    fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-amber-600 tabular-nums">{formatCurrency(totals.days31_60,  fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-orange-600 tabular-nums">{formatCurrency(totals.days61_90,  fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-red-600 tabular-nums">{formatCurrency(totals.days91plus, fmtLocale)}</td>
                    <td className="py-3 px-3 text-end text-purple-600 tabular-nums">{formatCurrency(totals.unallocated, fmtLocale)}</td>
                    <td className="py-3 ps-3 text-end text-slate-900 tabular-nums">{formatCurrency(totals.total,      fmtLocale)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'trial' | 'pl' | 'ar' | 'ap' | 'vat' | 'bs' | 'profit' | 'booking-profit' | 'supplier-profit' | 'cashflow';

export default function ReportsPage() {
  const locale    = useLocale();
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;

  const { monthly, typeMix, loading: loadingReports, year, setYear } = useReportsData(agencyId);
  const { accounts, loading: loadingAccounts } = useChartOfAccounts();

  const [activeTab, setActiveTab]   = useState<TabId>('overview');
  const [vatRange, setVatRange]     = useState<VatDateRange>(() => ({ from: `${VAT_REPORT_YEAR}-01-01`, to: new Date().toISOString().slice(0, 10) }));
  const [showExport, setShowExport] = useState(false);

  function handleExportCSV() {
    setShowExport(false);
    const stamp = new Date().toISOString().slice(0, 10);
    void (async () => {
      try {
        if (activeTab === 'overview') {
          downloadCSV([
            ['الشهر', 'الحجوزات', 'الإيرادات (ر.س)', 'الضريبة (ر.س)', 'الإجمالي (ر.س)'],
            ...monthly.map(m => [m.nameAr, m.bookings, m.rev / 100, m.vat / 100, m.grandTotal / 100]),
          ], `النظرة-العامة-${year}.csv`);
        } else if (activeTab === 'trial') {
          const d = await apiFetch<{ rows?: { code: string; nameAr: string; totalDebit: number; totalCredit: number }[] }>(`/api/accounting/trial-balance?asOf=${stamp}`);
          if (!d.rows) return;
          downloadCSV([
            ['الكود', 'الحساب', 'مدين', 'دائن'],
            ...d.rows.map(a => [a.code, a.nameAr, a.totalDebit / 100, a.totalCredit / 100]),
          ], `ميزان-المراجعة-${stamp}.csv`);
        } else if (activeTab === 'pl' || activeTab === 'ar') {
          alert(isAr ? 'استخدم زر "تصدير CSV" داخل هذا التقرير' : 'Use the "Export CSV" button inside this report tab');
        } else if (activeTab === 'vat') {
          const d = await apiFetch<VatReturnData>(`/api/reports/vat-return?from=${vatRange.from}&to=${vatRange.to}`);
          downloadCSV([
            ['البند', 'الوعاء الضريبي (ر.س)', 'الضريبة (ر.س)'],
            ['إمدادات بالنسبة الأساسية', d.summary.standardRatedSales / 100, d.summary.outputVat / 100],
            ['إمدادات صفرية', d.summary.zeroRatedSales / 100, 0],
            ['ضريبة المدخلات', 0, d.summary.inputVat / 100],
            ['صافي الضريبة المستحقة', 0, d.summary.netVatPayable / 100],
            ['فرق المطابقة مع الفواتير', 0, d.reconciliation.difference / 100],
          ], `الاقرار-الضريبي-${vatRange.from}-${vatRange.to}.csv`);
        } else if (activeTab === 'bs') {
          const label: Record<string, string> = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
          const rows = accounts.filter(a => a.balanceHalalas !== 0).sort((a, b) => a.code.localeCompare(b.code));
          downloadCSV([
            ['التصنيف', 'الكود', 'الحساب', 'الرصيد (ر.س)'],
            ...rows.map(a => [label[a.type] ?? a.type, a.code, a.nameAr, a.balanceHalalas / 100]),
          ], `الميزانية-العمومية-${stamp}.csv`);
        } else if (activeTab === 'profit') {
          downloadCSV([
            ['الشهر', 'الحجوزات', 'الإيرادات (ر.س)', 'الضريبة (ر.س)'],
            ...monthly.map(m => [m.nameAr, m.bookings, m.rev / 100, m.vat / 100]),
            [],
            ['الخدمة', 'عدد الحجوزات', 'النسبة %'],
            ...typeMix.map(t => [t.nameAr, t.count, t.pct]),
          ], `تحليل-الربحية-${year}.csv`);
        } else if (activeTab === 'booking-profit') {
          const d = await apiFetch<{ rows: { label?: string; groupKey?: string; bookingCount: number; totalRevenue: number; totalCost: number; totalProfit: number; marginPct: number }[] }>(`/api/reports/booking-profitability?groupBy=serviceType`);
          downloadCSV([
            ['البند', 'عدد الحجوزات', 'الإيراد (ر.س)', 'التكلفة (ر.س)', 'الربح (ر.س)', 'الهامش %'],
            ...(d.rows ?? []).map(r => [r.label ?? r.groupKey ?? '', r.bookingCount, r.totalRevenue / 100, r.totalCost / 100, r.totalProfit / 100, r.marginPct]),
          ], `ربحية-الحجوزات-${stamp}.csv`);
        } else if (activeTab === 'supplier-profit') {
          const d = await apiFetch<{ rows: { supplierName: string; paymentCount: number; bookingCount: number; totalRevenue: number; totalCost: number; totalProfit: number; marginPct: number }[] }>(`/api/reports/supplier-profitability`);
          downloadCSV([
            ['المورد', 'عدد المدفوعات', 'عدد الحجوزات', 'الإيراد (ر.س)', 'التكلفة (ر.س)', 'الربح (ر.س)', 'الهامش %'],
            ...(d.rows ?? []).map(r => [r.supplierName, r.paymentCount, r.bookingCount, r.totalRevenue / 100, r.totalCost / 100, r.totalProfit / 100, r.marginPct]),
          ], `ربحية-الموردين-${stamp}.csv`);
        } else if (activeTab === 'ap') {
          const d = await apiFetch<{ rows: { supplierName: string; current: number; days31_60: number; days61_90: number; days91plus: number; unallocated: number; total: number }[] }>(`/api/reports/supplier-aging?asOf=${stamp}`);
          downloadCSV([
            ['المورد', 'جاري (ر.س)', '31-60 يوم', '61-90 يوم', '+91 يوم', 'غير موزع', 'الإجمالي (ر.س)'],
            ...(d.rows ?? []).map(r => [r.supplierName, r.current / 100, r.days31_60 / 100, r.days61_90 / 100, r.days91plus / 100, r.unallocated / 100, r.total / 100]),
          ], `اعمار-ذمم-الموردين-${stamp}.csv`);
        } else if (activeTab === 'cashflow') {
          const d = await apiFetch<{
            operating: { netIncome: number; adjustments: { labelAr: string; amount: number }[]; total: number };
            investing: { lines: { nameAr: string; amount: number }[]; total: number };
            financing: { lines: { nameAr: string; amount: number }[]; total: number };
            netCashChange: number;
          }>(`/api/reports/cash-flow?from=${year}-01-01&to=${year}-12-31`);
          const rows: (string | number)[][] = [['البند', 'المبلغ (ر.س)']];
          rows.push(['— الأنشطة التشغيلية —', '']);
          rows.push(['صافي الدخل', d.operating.netIncome / 100]);
          for (const a of d.operating.adjustments) rows.push([a.labelAr, a.amount / 100]);
          rows.push(['صافي النقد من التشغيل', d.operating.total / 100]);
          rows.push(['— الأنشطة الاستثمارية —', '']);
          for (const l of d.investing.lines) rows.push([l.nameAr, l.amount / 100]);
          rows.push(['صافي النقد من الاستثمار', d.investing.total / 100]);
          rows.push(['— الأنشطة التمويلية —', '']);
          for (const l of d.financing.lines) rows.push([l.nameAr, l.amount / 100]);
          rows.push(['صافي النقد من التمويل', d.financing.total / 100]);
          rows.push(['صافي التغير في النقد', d.netCashChange / 100]);
          downloadCSV(rows, `التدفق-النقدي-${year}.csv`);
        }
      } catch {
        alert(isAr ? 'تعذّر تصدير التقرير' : 'Failed to export report');
      }
    })();
  }

  const tabs: { id: TabId; labelAr: string; labelEn: string; icon: ReactNode; badge?: string }[] = [
    { id: 'overview', labelAr: 'نظرة عامة',           labelEn: 'Overview',           icon: <BarChart3  size={16} /> },
    { id: 'trial',    labelAr: 'ميزان المراجعة',       labelEn: 'Trial Balance',      icon: <Scale      size={16} /> },
    { id: 'pl',       labelAr: 'قائمة الدخل',          labelEn: 'Income Statement',   icon: <ListTree   size={16} /> },
    { id: 'ar',       labelAr: 'الذمم المدينة',         labelEn: 'AR Aging',           icon: <Receipt    size={16} /> },
    { id: 'bs',       labelAr: 'الميزانية العمومية',   labelEn: 'Balance Sheet',      icon: <Building2  size={16} /> },
    { id: 'profit',          labelAr: 'تحليل الربحية',       labelEn: 'Profitability',         icon: <PieChart   size={16} /> },
    { id: 'booking-profit',  labelAr: 'ربحية الحجوزات',      labelEn: 'Booking Profitability', icon: <TrendingUp size={16} /> },
    { id: 'supplier-profit', labelAr: 'ربحية الموردين',      labelEn: 'Supplier Profitability',icon: <Building2  size={16} /> },
    { id: 'ap',              labelAr: 'ذمم الموردين (عمر)',   labelEn: 'AP Aging',              icon: <Receipt    size={16} /> },
    { id: 'cashflow',        labelAr: 'التدفق النقدي',        labelEn: 'Cash Flow',             icon: <Wallet     size={16} /> },
    { id: 'vat',             labelAr: 'الإقرار الضريبي',     labelEn: 'VAT Return',            icon: <Stamp      size={16} />, badge: 'ZATCA' },
  ];

  return (
    <UpgradeGate feature="reports">
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
          <TrialBalanceTab locale={locale} />
        )}
        {activeTab === 'pl' && (
          <IncomeStatementTab accounts={accounts} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'ar' && (
          <ArAgingTab />
        )}
        {activeTab === 'bs' && (
          <BalanceSheetTab accounts={accounts} loadingAccounts={loadingAccounts} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'profit' && (
          <ProfitabilityTab monthly={monthly} typeMix={typeMix} loading={loadingReports} isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'booking-profit' && (
          <BookingProfitabilityTab isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'supplier-profit' && (
          <SupplierProfitabilityTab isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'ap' && (
          <SupplierAgingTab isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'cashflow' && (
          <CashFlowTab isAr={isAr} fmtLocale={fmtLocale} />
        )}
        {activeTab === 'vat' && (
          <VATReturnTab isAr={isAr} fmtLocale={fmtLocale} vatRange={vatRange} onVatRangeChange={setVatRange} />
        )}
      </div>
    </div>
    </UpgradeGate>
  );
}
