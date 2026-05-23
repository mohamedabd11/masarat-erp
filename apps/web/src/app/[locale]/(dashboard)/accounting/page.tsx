'use client';

// NOTE: This page uses 'use client' to support the expandable rows feature.
// In production the journal entry data would be fetched server-side via
// Firestore Cloud Functions and passed as props, or fetched client-side
// via a useJournalEntries() hook.

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Layers,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type EntryStatus = 'balanced' | 'draft';
type EntryType = 'agent' | 'principal' | 'receipt' | 'payment' | 'adjustment';

interface JournalLine {
  accountCode: string;
  accountAr: string;
  accountEn: string;
  debitHalalas: number;
  creditHalalas: number;
  memo: string;
}

interface JournalEntry {
  id: string;
  date: Date;
  type: EntryType;
  descAr: string;
  descEn: string;
  lines: JournalLine[];
  status: EntryStatus;
  reference?: string;
}

interface ChartAccount {
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balanceHalalas: number;
  side: 'debit' | 'credit';
}

// ─── Demo data ────────────────────────────────────────────────────────────────

// Travel agency uses a hybrid model:
//   - Agent model: Revenue = commission only (used for airline tickets, visas)
//   - Principal model: Revenue = full sale price (used for packages, hotels)

const DEMO_ENTRIES: JournalEntry[] = [
  // 1 ── Principal model — package sale
  {
    id: 'JE-2026-00051',
    date: new Date('2026-05-22'),
    type: 'principal',
    descAr: 'حجز باقة سياحية — منى القحطاني BK-2026-000245',
    descEn: 'Tour package sale — Mona Al-Qahtani BK-2026-000245',
    status: 'balanced',
    reference: 'BK-2026-000245',
    lines: [
      {
        accountCode: '1120',
        accountAr: 'ذمم مدينة — عملاء',
        accountEn: 'Accounts Receivable — Customers',
        debitHalalas: 1_380_000,
        creditHalalas: 0,
        memo: 'إجمالي مع ضريبة — INV-2026-000245',
      },
      {
        accountCode: '4110',
        accountAr: 'إيرادات باقات سياحية',
        accountEn: 'Tour Package Revenue',
        debitHalalas: 0,
        creditHalalas: 1_200_000,
        memo: 'صافي الإيراد بدون ضريبة',
      },
      {
        accountCode: '2310',
        accountAr: 'ضريبة القيمة المضافة — مستحقة',
        accountEn: 'VAT Payable',
        debitHalalas: 0,
        creditHalalas: 180_000,
        memo: 'ضريبة 15% على الباقة',
      },
    ],
  },

  // 2 ── Agent model — flight commission
  {
    id: 'JE-2026-00050',
    date: new Date('2026-05-21'),
    type: 'agent',
    descAr: 'عمولة حجز طيران — فاطمة الزهراني BK-2026-000247',
    descEn: 'Flight booking commission — Fatima Al-Zahrani BK-2026-000247',
    status: 'balanced',
    reference: 'BK-2026-000247',
    lines: [
      {
        accountCode: '1120',
        accountAr: 'ذمم مدينة — عملاء',
        accountEn: 'Accounts Receivable — Customers',
        debitHalalas: 253_000,
        creditHalalas: 0,
        memo: 'إجمالي مع ضريبة — INV-2026-000247',
      },
      {
        accountCode: '2110',
        accountAr: 'ذمم دائنة — شركات طيران',
        accountEn: 'Accounts Payable — Airlines',
        debitHalalas: 0,
        creditHalalas: 220_000,
        memo: 'مبلغ التذكرة مستحق للشركة',
      },
      {
        accountCode: '4210',
        accountAr: 'إيرادات عمولات طيران',
        accountEn: 'Flight Commission Revenue',
        debitHalalas: 0,
        creditHalalas: 28_696,
        memo: 'عمولة 13% على قيمة التذكرة',
      },
      {
        accountCode: '2310',
        accountAr: 'ضريبة القيمة المضافة — مستحقة',
        accountEn: 'VAT Payable',
        debitHalalas: 0,
        creditHalalas: 4_304,
        memo: 'ضريبة 15% على العمولة',
      },
    ],
  },

  // 3 ── Receipt — partial payment
  {
    id: 'JE-2026-00049',
    date: new Date('2026-05-21'),
    type: 'receipt',
    descAr: 'استلام دفعة — خالد السعد BK-2026-000246',
    descEn: 'Payment receipt — Khalid Al-Saad BK-2026-000246',
    status: 'balanced',
    reference: 'BK-2026-000246',
    lines: [
      {
        accountCode: '1110',
        accountAr: 'البنك — الحساب الجاري',
        accountEn: 'Bank — Current Account',
        debitHalalas: 200_000,
        creditHalalas: 0,
        memo: 'تحويل بنكي — مرجع TXN-4422',
      },
      {
        accountCode: '1120',
        accountAr: 'ذمم مدينة — عملاء',
        accountEn: 'Accounts Receivable — Customers',
        debitHalalas: 0,
        creditHalalas: 200_000,
        memo: 'تسوية جزئية لحجز فندق',
      },
    ],
  },

  // 4 ── Principal model — Umrah program sale (fully paid)
  {
    id: 'JE-2026-00048',
    date: new Date('2026-05-20'),
    type: 'principal',
    descAr: 'حجز برنامج عمرة — أحمد العمري BK-2026-000248',
    descEn: 'Umrah program sale — Ahmed Al-Omari BK-2026-000248',
    status: 'balanced',
    reference: 'BK-2026-000248',
    lines: [
      {
        accountCode: '1110',
        accountAr: 'البنك — الحساب الجاري',
        accountEn: 'Bank — Current Account',
        debitHalalas: 902_500,
        creditHalalas: 0,
        memo: 'دفع كامل — تحويل بنكي TXN-4401',
      },
      {
        accountCode: '4120',
        accountAr: 'إيرادات برامج العمرة والحج',
        accountEn: 'Umrah & Hajj Program Revenue',
        debitHalalas: 0,
        creditHalalas: 850_000,
        memo: 'قيمة البرنامج بدون ضريبة',
      },
      {
        accountCode: '2310',
        accountAr: 'ضريبة القيمة المضافة — مستحقة',
        accountEn: 'VAT Payable',
        debitHalalas: 0,
        creditHalalas: 52_500,
        memo: 'ضريبة 15% — مُعفى جزئياً للعمرة',
      },
    ],
  },

  // 5 ── Adjustment — draft entry for visa fee
  {
    id: 'JE-2026-00047',
    date: new Date('2026-05-22'),
    type: 'adjustment',
    descAr: 'مصاريف رسوم تأشيرة — سعود الغامدي BK-2026-000244',
    descEn: 'Visa fee expense — Saud Al-Ghamdi BK-2026-000244',
    status: 'draft',
    reference: 'BK-2026-000244',
    lines: [
      {
        accountCode: '5210',
        accountAr: 'مصاريف رسوم تأشيرات',
        accountEn: 'Visa Fee Expenses',
        debitHalalas: 65_000,
        creditHalalas: 0,
        memo: 'رسوم السفارة الرسمية',
      },
      {
        accountCode: '2110',
        accountAr: 'ذمم دائنة — جهات حكومية',
        accountEn: 'Accounts Payable — Government Bodies',
        debitHalalas: 0,
        creditHalalas: 65_000,
        memo: 'مستحق للسفارة — قيد مسودة',
      },
    ],
  },
];

// ─── Chart of accounts summary ────────────────────────────────────────────────

const CHART_OF_ACCOUNTS: ChartAccount[] = [
  {
    code: '1110',
    nameAr: 'البنك — الحساب الجاري',
    nameEn: 'Bank — Current Account',
    type: 'asset',
    balanceHalalas: 1_102_500,
    side: 'debit',
  },
  {
    code: '1120',
    nameAr: 'ذمم مدينة — عملاء',
    nameEn: 'Accounts Receivable',
    type: 'asset',
    balanceHalalas: 1_433_000,
    side: 'debit',
  },
  {
    code: '2110',
    nameAr: 'ذمم دائنة — موردون',
    nameEn: 'Accounts Payable',
    type: 'liability',
    balanceHalalas: 285_000,
    side: 'credit',
  },
  {
    code: '2310',
    nameAr: 'ضريبة القيمة المضافة — مستحقة',
    nameEn: 'VAT Payable',
    type: 'liability',
    balanceHalalas: 236_804,
    side: 'credit',
  },
  {
    code: '4110',
    nameAr: 'إيرادات باقات سياحية',
    nameEn: 'Tour Package Revenue',
    type: 'revenue',
    balanceHalalas: 1_200_000,
    side: 'credit',
  },
  {
    code: '4120',
    nameAr: 'إيرادات برامج العمرة والحج',
    nameEn: 'Umrah & Hajj Revenue',
    type: 'revenue',
    balanceHalalas: 850_000,
    side: 'credit',
  },
  {
    code: '4210',
    nameAr: 'إيرادات عمولات طيران',
    nameEn: 'Flight Commission Revenue',
    type: 'revenue',
    balanceHalalas: 28_696,
    side: 'credit',
  },
  {
    code: '5210',
    nameAr: 'مصاريف رسوم تأشيرات',
    nameEn: 'Visa Fee Expenses',
    type: 'expense',
    balanceHalalas: 65_000,
    side: 'debit',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function entryTotalDebit(entry: JournalEntry): number {
  return entry.lines.reduce((s, l) => s + l.debitHalalas, 0);
}

function entryTotalCredit(entry: JournalEntry): number {
  return entry.lines.reduce((s, l) => s + l.creditHalalas, 0);
}

const ENTRY_TYPE_LABELS: Record<EntryType, { ar: string; en: string }> = {
  principal: { ar: 'نموذج أصيل',    en: 'Principal Model' },
  agent:     { ar: 'نموذج وسيط',    en: 'Agent Model' },
  receipt:   { ar: 'قيد استلام',    en: 'Receipt Entry' },
  payment:   { ar: 'قيد دفع',       en: 'Payment Entry' },
  adjustment:{ ar: 'تسوية',         en: 'Adjustment' },
};

const ENTRY_TYPE_BADGE: Record<EntryType, 'default' | 'info' | 'success' | 'warning' | 'neutral'> = {
  principal: 'default',
  agent:     'info',
  receipt:   'success',
  payment:   'warning',
  adjustment:'neutral',
};

const ACCOUNT_TYPE_LABELS: Record<ChartAccount['type'], { ar: string; en: string; color: string }> = {
  asset:     { ar: 'أصول',         en: 'Asset',     color: 'text-brand-700 bg-brand-50' },
  liability: { ar: 'التزامات',     en: 'Liability', color: 'text-red-700 bg-red-50' },
  equity:    { ar: 'حقوق ملكية',   en: 'Equity',    color: 'text-purple-700 bg-purple-50' },
  revenue:   { ar: 'إيرادات',      en: 'Revenue',   color: 'text-emerald-700 bg-emerald-50' },
  expense:   { ar: 'مصاريف',       en: 'Expense',   color: 'text-amber-700 bg-amber-50' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="flex items-start gap-4">
      <div className={cn('p-3 rounded-xl flex-shrink-0', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 font-medium mb-0.5">{label}</p>
        <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

function EntryRow({
  entry,
  isAr,
  fmtLocale,
}: {
  entry: JournalEntry;
  isAr: boolean;
  fmtLocale: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const debit = entryTotalDebit(entry);
  const credit = entryTotalCredit(entry);
  const isBalanced = entry.status === 'balanced';

  return (
    <>
      {/* Main row */}
      <tr
        className={cn(
          'hover:bg-slate-50/60 transition-colors cursor-pointer select-none',
          expanded && 'bg-brand-50/40',
        )}
        onClick={() => setExpanded((v: boolean) => !v)}
      >
        {/* Expand indicator */}
        <td className="ps-4 pe-2 py-3.5 w-8">
          <span className="text-slate-400">
            {expanded
              ? <ChevronDown size={15} />
              : <ChevronRight size={15} />}
          </span>
        </td>

        {/* Entry # */}
        <td className="px-3 py-3.5">
          <span className="font-mono text-sm font-semibold text-brand-700">{entry.id}</span>
          {entry.reference && (
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{entry.reference}</p>
          )}
        </td>

        {/* Date */}
        <td className="px-3 py-3.5 hidden sm:table-cell">
          <span className="text-sm text-slate-600">
            {formatDate(entry.date, fmtLocale)}
          </span>
        </td>

        {/* Type */}
        <td className="px-3 py-3.5 hidden md:table-cell">
          <Badge variant={ENTRY_TYPE_BADGE[entry.type]}>
            {isAr
              ? ENTRY_TYPE_LABELS[entry.type].ar
              : ENTRY_TYPE_LABELS[entry.type].en}
          </Badge>
        </td>

        {/* Description */}
        <td className="px-3 py-3.5">
          <p className="text-sm text-slate-800 line-clamp-1">
            {isAr ? entry.descAr : entry.descEn}
          </p>
        </td>

        {/* Debit */}
        <td className="px-3 py-3.5 text-end hidden lg:table-cell">
          <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
            {formatCurrency(debit, fmtLocale)}
          </span>
        </td>

        {/* Credit */}
        <td className="px-3 py-3.5 text-end hidden lg:table-cell">
          <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
            {formatCurrency(credit, fmtLocale)}
          </span>
        </td>

        {/* Status */}
        <td className="px-3 pe-5 py-3.5">
          {isBalanced ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 size={13} />
              {isAr ? 'متوازن' : 'Balanced'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
              <Clock size={13} />
              {isAr ? 'مسودة' : 'Draft'}
            </span>
          )}
        </td>
      </tr>

      {/* Expanded lines */}
      {expanded && (
        <tr>
          <td colSpan={8} className="px-0 py-0">
            <div className="bg-slate-50 border-y border-surface-border">
              {/* Lines table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="text-start ps-12 pe-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">
                        {isAr ? 'كود' : 'Code'}
                      </th>
                      <th className="text-start px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'الحساب' : 'Account'}
                      </th>
                      <th className="text-start px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">
                        {isAr ? 'البيان' : 'Memo'}
                      </th>
                      <th className="text-end px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'مدين' : 'Debit'}
                      </th>
                      <th className="text-end pe-8 px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {isAr ? 'دائن' : 'Credit'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-surface-border last:border-0"
                      >
                        <td className="ps-12 pe-4 py-2.5">
                          <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {line.accountCode}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm text-slate-700">
                            {isAr ? line.accountAr : line.accountEn}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className="text-xs text-slate-400">{line.memo}</span>
                        </td>
                        <td className="px-4 py-2.5 text-end">
                          {line.debitHalalas > 0 ? (
                            <span className="text-sm font-mono tabular-nums text-slate-800">
                              {formatCurrency(line.debitHalalas, fmtLocale)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="pe-8 px-4 py-2.5 text-end">
                          {line.creditHalalas > 0 ? (
                            <span className="text-sm font-mono tabular-nums text-slate-800">
                              {formatCurrency(line.creditHalalas, fmtLocale)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="bg-slate-100/80 border-t border-slate-200">
                      <td colSpan={3} className="ps-12 pe-4 py-2.5">
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          {isAr ? 'الإجمالي' : 'Total'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {formatCurrency(debit, fmtLocale)}
                        </span>
                      </td>
                      <td className="pe-8 px-4 py-2.5 text-end">
                        <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {formatCurrency(credit, fmtLocale)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  // Aggregate stats
  const totalDebit = DEMO_ENTRIES.reduce((s, e) => s + entryTotalDebit(e), 0);
  const totalCredit = DEMO_ENTRIES.reduce((s, e) => s + entryTotalCredit(e), 0);
  const balancedCount = DEMO_ENTRIES.filter(e => e.status === 'balanced').length;

  // Chart of accounts grouped by type
  const assets     = CHART_OF_ACCOUNTS.filter(a => a.type === 'asset');
  const liabilities= CHART_OF_ACCOUNTS.filter(a => a.type === 'liability');
  const revenues   = CHART_OF_ACCOUNTS.filter(a => a.type === 'revenue');
  const expenses   = CHART_OF_ACCOUNTS.filter(a => a.type === 'expense');

  const totalRevenue = revenues.reduce((s, a) => s + a.balanceHalalas, 0);
  const totalExpense = expenses.reduce((s, a) => s + a.balanceHalalas, 0);
  const netIncome    = totalRevenue - totalExpense;

  return (
    <div className="space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'المحاسبة' : 'Accounting'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? 'القيود اليومية وميزان المراجعة ودليل الحسابات'
              : 'Journal entries, trial balance, and chart of accounts'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
            <Download size={15} />
            {isAr ? 'تصدير Excel' : 'Export Excel'}
          </button>
          <Button>
            <BookOpen size={15} />
            {isAr ? 'قيد جديد' : 'New Entry'}
          </Button>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp size={20} />}
          iconBg="bg-brand-50"
          iconColor="text-brand-600"
          label={isAr ? 'إجمالي المدين' : 'Total Debit'}
          value={formatCurrency(totalDebit, fmtLocale)}
          sub={`${DEMO_ENTRIES.length} ${isAr ? 'قيد' : 'entries'}`}
        />
        <StatCard
          icon={<TrendingDown size={20} />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          label={isAr ? 'إجمالي الدائن' : 'Total Credit'}
          value={formatCurrency(totalCredit, fmtLocale)}
          sub={totalDebit === totalCredit ? (isAr ? 'الميزان متوازن' : 'Trial balance OK') : (isAr ? 'فرق في الميزان!' : 'Imbalance!')}
        />
        <StatCard
          icon={<Layers size={20} />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label={isAr ? 'قيود متوازنة' : 'Balanced Entries'}
          value={`${balancedCount} / ${DEMO_ENTRIES.length}`}
          sub={isAr ? 'متطابق مدين/دائن' : 'Debit = Credit'}
        />
        <StatCard
          icon={<BarChart3 size={20} />}
          iconBg={netIncome >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          iconColor={netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}
          label={isAr ? 'صافي الدخل' : 'Net Income'}
          value={formatCurrency(netIncome, fmtLocale)}
          sub={isAr ? 'إيرادات − مصاريف' : 'Revenue − Expenses'}
        />
      </div>

      {/* ── Main content grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Journal entries table ──────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {isAr ? 'القيود اليومية' : 'Journal Entries'}
            </h2>
            <p className="text-xs text-slate-400">
              {isAr ? 'انقر على القيد لعرض التفاصيل' : 'Click a row to expand details'}
            </p>
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border bg-slate-50/60">
                    <th className="w-8 ps-4 pe-2 py-3" />
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'رقم القيد' : 'Entry #'}
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                      {isAr ? 'التاريخ' : 'Date'}
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                      {isAr ? 'النوع' : 'Type'}
                    </th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'البيان' : 'Description'}
                    </th>
                    <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                      {isAr ? 'مدين' : 'Debit'}
                    </th>
                    <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                      {isAr ? 'دائن' : 'Credit'}
                    </th>
                    <th className="text-start px-3 pe-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'الحالة' : 'Status'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {DEMO_ENTRIES.map(entry => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      isAr={isAr}
                      fmtLocale={fmtLocale}
                    />
                  ))}
                </tbody>
                {/* Table footer totals */}
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={5} className="ps-12 pe-4 py-3.5">
                      <span className="text-sm font-bold text-slate-700">
                        {isAr ? 'مجموع الفترة' : 'Period Total'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-end hidden lg:table-cell">
                      <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                        {formatCurrency(totalDebit, fmtLocale)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-end hidden lg:table-cell">
                      <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                        {formatCurrency(totalCredit, fmtLocale)}
                      </span>
                    </td>
                    <td className="px-3 pe-5 py-3.5">
                      {totalDebit === totalCredit ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={13} />
                          {isAr ? 'متوازن' : 'Balanced'}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-red-600">
                          {isAr ? 'غير متوازن' : 'Unbalanced'}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>

        {/* ── Chart of accounts summary ──────────────────────────────────── */}
        <div className="space-y-4">
          {/* Net income summary */}
          <Card
            className={cn(
              'border-2',
              netIncome >= 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50',
            )}
          >
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {isAr ? 'ملخص الأداء المالي' : 'Financial Performance'}
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}</span>
                <span className="text-sm font-semibold text-emerald-700 font-mono tabular-nums">
                  {formatCurrency(totalRevenue, fmtLocale)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{isAr ? 'إجمالي المصاريف' : 'Total Expenses'}</span>
                <span className="text-sm font-semibold text-red-600 font-mono tabular-nums">
                  ({formatCurrency(totalExpense, fmtLocale)})
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{isAr ? 'صافي الدخل' : 'Net Income'}</span>
                <span
                  className={cn(
                    'text-sm font-bold font-mono tabular-nums',
                    netIncome >= 0 ? 'text-emerald-700' : 'text-red-600',
                  )}
                >
                  {formatCurrency(netIncome, fmtLocale)}
                </span>
              </div>
            </div>
          </Card>

          {/* Chart of accounts card */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-surface-border">
              <h3 className="text-sm font-semibold text-slate-900">
                {isAr ? 'دليل الحسابات' : 'Chart of Accounts'}
              </h3>
            </div>

            <div className="divide-y divide-surface-border">
              {[
                { label: { ar: 'الأصول', en: 'Assets' }, accounts: assets },
                { label: { ar: 'الالتزامات', en: 'Liabilities' }, accounts: liabilities },
                { label: { ar: 'الإيرادات', en: 'Revenue' }, accounts: revenues },
                { label: { ar: 'المصاريف', en: 'Expenses' }, accounts: expenses },
              ].map(group => (
                <div key={group.label.en}>
                  {/* Group header */}
                  <div className="px-5 py-2 bg-slate-50/80">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {isAr ? group.label.ar : group.label.en}
                    </span>
                  </div>
                  {/* Account rows */}
                  {group.accounts.map(account => {
                    const meta = ACCOUNT_TYPE_LABELS[account.type];
                    return (
                      <div
                        key={account.code}
                        className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-xs text-slate-400 flex-shrink-0 w-10">
                            {account.code}
                          </span>
                          <span className="text-xs text-slate-700 truncate">
                            {isAr ? account.nameAr : account.nameEn}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ms-3">
                          <span className="text-xs font-mono tabular-nums text-slate-800 font-semibold">
                            {formatCurrency(account.balanceHalalas, fmtLocale)}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-medium px-1.5 py-0.5 rounded',
                              meta.color,
                            )}
                          >
                            {account.side === 'debit'
                              ? (isAr ? 'م' : 'Dr')
                              : (isAr ? 'د' : 'Cr')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-surface-border bg-slate-50/40">
              <p className="text-xs text-slate-400">
                {isAr
                  ? `${CHART_OF_ACCOUNTS.length} حساب — مايو 2026`
                  : `${CHART_OF_ACCOUNTS.length} accounts — May 2026`}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
