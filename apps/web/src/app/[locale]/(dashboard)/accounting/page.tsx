'use client';

// NOTE: 'use client' is required for the tab state and expandable journal entry rows.

import { useState, useEffect, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ChartOfAccountsClient } from '@/components/accounting/ChartOfAccountsClient';
import { TrialBalanceTab } from '@/components/accounting/TrialBalanceTab';
import { MigrationTool } from '@/components/accounting/MigrationTool';
import { CurrenciesClient } from '@/components/currencies/CurrenciesClient';
import { formatCurrency, formatDate, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { UpgradeGate } from '@/components/ui/UpgradeGate';
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
  ListTree,
  DollarSign,
  Plus,
  X,
  Scale,
  Wrench,
  Repeat2,
  AlertCircle,
  FileText,
  RefreshCw,
  CreditCard,
  Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface LineForm {
  accountCode: string;
  accountAr: string;
  accountEn: string;
  debitSAR: string;
  creditSAR: string;
  memo: string;
}

// ─── Firestore → local mappers ────────────────────────────────────────────────

function referenceTypeToEntryType(rt: string): EntryType {
  if (rt === 'payment') return 'receipt';
  if (rt === 'refund') return 'adjustment';
  if (rt === 'supplier_payment') return 'payment';
  return 'principal';
}

function fsLineToLocal(fl: Record<string, unknown>): JournalLine {
  return {
    accountCode:   String(fl.accountCode   ?? ''),
    accountAr:     String(fl.accountNameAr ?? fl.accountAr ?? ''),
    accountEn:     String(fl.accountNameEn ?? fl.accountEn ?? ''),
    debitHalalas:  Number(fl.debitHalalas  ?? 0),
    creditHalalas: Number(fl.creditHalalas ?? 0),
    memo:          String(fl.memo          ?? ''),
  };
}

function fsDocToEntry(docId: string, data: Record<string, unknown>): JournalEntry {
  const lines = Array.isArray(data.lines)
    ? (data.lines as Record<string, unknown>[]).map(fsLineToLocal)
    : [];
  let date = new Date();
  // Support Postgres ISO string date field or Firestore Timestamp
  if (data.date && typeof data.date === 'string') {
    date = new Date(data.date);
  } else {
    const ca = data.createdAt as { toDate?: () => Date } | string | undefined;
    if (typeof ca === 'string') date = new Date(ca);
    else if (ca?.toDate) date = ca.toDate();
  }
  return {
    id:        String(data.entryNumber ?? data.jeNumber ?? docId),
    date,
    type:      referenceTypeToEntryType(String(data.source ?? data.referenceType ?? '')),
    descAr:    String(data.descriptionAr ?? data.description ?? ''),
    descEn:    String(data.descriptionEn ?? data.description ?? ''),
    lines,
    status:    (data.isPosted === true || data.isBalanced === true) ? 'balanced' : 'draft',
    reference: data.sourceId ? String(data.sourceId) : (data.referenceId ? String(data.referenceId) : undefined),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function entryTotalDebit(entry: JournalEntry): number {
  return entry.lines.reduce((s, l) => s + l.debitHalalas, 0);
}

function entryTotalCredit(entry: JournalEntry): number {
  return entry.lines.reduce((s, l) => s + l.creditHalalas, 0);
}

const ENTRY_TYPE_LABELS: Record<EntryType, { ar: string; en: string }> = {
  principal:  { ar: 'نموذج أصيل',  en: 'Principal Model' },
  agent:      { ar: 'نموذج وسيط', en: 'Agent Model' },
  receipt:    { ar: 'قيد استلام',  en: 'Receipt Entry' },
  payment:    { ar: 'قيد دفع',     en: 'Payment Entry' },
  adjustment: { ar: 'تسوية',       en: 'Adjustment' },
};

const ENTRY_TYPE_BADGE: Record<EntryType, 'default' | 'info' | 'success' | 'warning' | 'neutral'> = {
  principal:  'default',
  agent:      'info',
  receipt:    'success',
  payment:    'warning',
  adjustment: 'neutral',
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
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
        <p className="text-base sm:text-xl font-bold text-slate-900 truncate" title={value}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

// ─── EntryRow ─────────────────────────────────────────────────────────────────

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
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand indicator */}
        <td className="ps-4 pe-2 py-3.5 w-8">
          <span className="text-slate-400">
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
            {isAr ? ENTRY_TYPE_LABELS[entry.type].ar : ENTRY_TYPE_LABELS[entry.type].en}
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

// ─── JournalEntriesTab ────────────────────────────────────────────────────────

function JournalEntriesTab({
  isAr,
  fmtLocale,
  entries,
}: {
  isAr: boolean;
  fmtLocale: string;
  entries: JournalEntry[];
}) {
  const totalDebit = entries.reduce((s, e) => s + entryTotalDebit(e), 0);
  const totalCredit = entries.reduce((s, e) => s + entryTotalCredit(e), 0);
  const balancedCount = entries.filter((e) => e.status === 'balanced').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<TrendingUp size={20} />}
          iconBg="bg-brand-50"
          iconColor="text-brand-600"
          label={isAr ? 'إجمالي المدين' : 'Total Debit'}
          value={formatCurrency(totalDebit, fmtLocale)}
          sub={`${formatCount(entries.length, fmtLocale)} ${isAr ? 'قيد' : 'entries'}`}
        />
        <StatCard
          icon={<TrendingDown size={20} />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          label={isAr ? 'إجمالي الدائن' : 'Total Credit'}
          value={formatCurrency(totalCredit, fmtLocale)}
          sub={
            totalDebit === totalCredit
              ? isAr ? 'الميزان متوازن' : 'Trial balance OK'
              : isAr ? 'فرق في الميزان!' : 'Imbalance!'
          }
        />
        <StatCard
          icon={<Layers size={20} />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label={isAr ? 'قيود متوازنة' : 'Balanced Entries'}
          value={`${formatCount(balancedCount, fmtLocale)} / ${formatCount(entries.length, fmtLocale)}`}
          sub={isAr ? 'متطابق مدين/دائن' : 'Debit = Credit'}
        />
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
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
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    isAr={isAr}
                    fmtLocale={fmtLocale}
                  />
                ))}
              </tbody>
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
    </div>
  );
}

// ─── NewEntryModal ────────────────────────────────────────────────────────────

const EMPTY_LINE: LineForm = { accountCode: '', accountAr: '', accountEn: '', debitSAR: '', creditSAR: '', memo: '' };

function NewEntryModal({
  isAr,
  agencyId,
  onClose,
  onSave,
}: {
  isAr: boolean;
  agencyId: string | null;
  onClose: () => void;
  onSave: (entry: JournalEntry) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [type, setType] = useState<EntryType>('principal');
  const [descAr, setDescAr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineForm[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const totalDebitSAR  = lines.reduce((s, l) => s + (Number(l.debitSAR)  || 0), 0);
  const totalCreditSAR = lines.reduce((s, l) => s + (Number(l.creditSAR) || 0), 0);
  const isBalanced = totalDebitSAR > 0 && Math.abs(totalDebitSAR - totalCreditSAR) < 0.001;

  function updateLine(idx: number, field: keyof LineForm, value: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }
  function addLine() { setLines(prev => [...prev, { ...EMPTY_LINE }]); }
  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError('');
    if (!descAr.trim()) { setError(isAr ? 'البيان العربي مطلوب' : 'Arabic description is required'); return; }
    const validLines = lines.filter(l => l.accountCode.trim() || Number(l.debitSAR) || Number(l.creditSAR));
    if (validLines.length < 2) { setError(isAr ? 'يجب إدخال سطرين على الأقل' : 'At least 2 lines required'); return; }
    if (!isBalanced) { setError(isAr ? 'يجب أن يتساوى المدين والدائن' : 'Debit must equal Credit'); return; }

    const year    = new Date().getFullYear();
    const jeNumber = `JE-${year}-${String(Date.now()).slice(-8)}`;
    const mappedLines = validLines.map(l => ({
      accountCode:   l.accountCode.trim(),
      accountNameAr: l.accountAr.trim(),
      accountNameEn: l.accountEn.trim() || l.accountAr.trim(),
      accountType:   'asset' as const,
      debitHalalas:  Math.round((Number(l.debitSAR)  || 0) * 100),
      creditHalalas: Math.round((Number(l.creditSAR) || 0) * 100),
      memo:          l.memo.trim(),
    }));
    const totalDR = mappedLines.reduce((s, l) => s + l.debitHalalas,  0);
    const totalCR = mappedLines.reduce((s, l) => s + l.creditHalalas, 0);

    const entry: JournalEntry = {
      id: jeNumber,
      date: new Date(date),
      type,
      descAr: descAr.trim(),
      descEn: descEn.trim() || descAr.trim(),
      reference: reference.trim() || undefined,
      status: 'balanced',
      lines: mappedLines.map(l => ({
        accountCode:   l.accountCode,
        accountAr:     l.accountNameAr,
        accountEn:     l.accountNameEn,
        debitHalalas:  l.debitHalalas,
        creditHalalas: l.creditHalalas,
        memo:          l.memo,
      })),
    };

    if (agencyId) {
      setSaving(true);
      try {
        const { apiFetch } = await import('@/lib/api-client');
        await apiFetch('/api/accounting/journal', {
          method: 'POST',
          body: JSON.stringify({
            entryNumber:        jeNumber,
            date,
            descriptionAr:      descAr.trim(),
            descriptionEn:      descEn.trim() || descAr.trim(),
            reference:          reference.trim() || null,
            source:             'manual',
            totalDebitHalalas:  totalDR,
            totalCreditHalalas: totalCR,
            isPosted:           true,
            lines:              mappedLines,
          }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : (isAr ? 'خطأ في الحفظ' : 'Save error'));
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    onSave(entry);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BookOpen size={20} className="text-brand-600" />
            {isAr ? 'إضافة قيد يومي جديد' : 'New Journal Entry'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Basic fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'التاريخ' : 'Date'}</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'النوع' : 'Type'}</label>
              <select value={type} onChange={e => setType(e.target.value as EntryType)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {(Object.entries(ENTRY_TYPE_LABELS) as [EntryType, { ar: string; en: string }][]).map(([key, labels]) => (
                  <option key={key} value={key}>{isAr ? labels.ar : labels.en}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'المرجع (اختياري)' : 'Reference (optional)'}</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                placeholder="BK-2026-000XXX"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                {isAr ? 'البيان (عربي)' : 'Description (Arabic)'}
                <span className="text-red-500 ms-0.5">*</span>
              </label>
              <input type="text" value={descAr} onChange={e => setDescAr(e.target.value)} dir="rtl"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isAr ? 'البيان (إنجليزي)' : 'Description (English)'}</label>
              <input type="text" value={descEn} onChange={e => setDescEn(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{isAr ? 'سطور القيد' : 'Journal Lines'}</h3>
              <button onClick={addLine} className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
                <Plus size={13} /> {isAr ? 'إضافة سطر' : 'Add Line'}
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-start ps-3 pe-2 py-2.5 text-xs font-semibold text-slate-500 w-20">{isAr ? 'كود' : 'Code'}</th>
                    <th className="text-start px-2 py-2.5 text-xs font-semibold text-slate-500">{isAr ? 'اسم الحساب (عربي)' : 'Account (AR)'}</th>
                    <th className="text-start px-2 py-2.5 text-xs font-semibold text-slate-500 hidden md:table-cell">{isAr ? 'اسم الحساب (إنجليزي)' : 'Account (EN)'}</th>
                    <th className="text-end px-2 py-2.5 text-xs font-semibold text-slate-500 w-28">{isAr ? 'مدين (ر.س)' : 'Debit (SAR)'}</th>
                    <th className="text-end px-2 py-2.5 text-xs font-semibold text-slate-500 w-28">{isAr ? 'دائن (ر.س)' : 'Credit (SAR)'}</th>
                    <th className="text-start px-2 py-2.5 text-xs font-semibold text-slate-500 hidden lg:table-cell">{isAr ? 'البيان' : 'Memo'}</th>
                    <th className="w-7 pe-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="ps-3 pe-2 py-1.5">
                        <input type="text" value={line.accountCode} onChange={e => updateLine(idx, 'accountCode', e.target.value)}
                          placeholder="1120"
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="text" value={line.accountAr} onChange={e => updateLine(idx, 'accountAr', e.target.value)}
                          dir="rtl" placeholder={isAr ? 'اسم الحساب' : 'Account name'}
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-1.5 hidden md:table-cell">
                        <input type="text" value={line.accountEn} onChange={e => updateLine(idx, 'accountEn', e.target.value)}
                          placeholder="Account name"
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={line.debitSAR} onChange={e => updateLine(idx, 'debitSAR', e.target.value)}
                          placeholder="0.00" min="0" step="0.01"
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-end font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={line.creditSAR} onChange={e => updateLine(idx, 'creditSAR', e.target.value)}
                          placeholder="0.00" min="0" step="0.01"
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-end font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="px-2 py-1.5 hidden lg:table-cell">
                        <input type="text" value={line.memo} onChange={e => updateLine(idx, 'memo', e.target.value)}
                          placeholder={isAr ? 'بيان اختياري' : 'Optional memo'}
                          className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      </td>
                      <td className="pe-2 py-1.5">
                        <button onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                          className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 disabled:opacity-25 transition-colors">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="ps-3 pe-2 py-2.5">
                      <span className="text-xs font-bold text-slate-600">{isAr ? 'الإجمالي' : 'Total'}</span>
                    </td>
                    <td className="px-2 py-2.5 text-end">
                      <span className={cn('text-sm font-bold font-mono tabular-nums', isBalanced ? 'text-emerald-700' : 'text-slate-900')}>
                        {totalDebitSAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-end">
                      <span className={cn('text-sm font-bold font-mono tabular-nums', isBalanced ? 'text-emerald-700' : 'text-slate-900')}>
                        {totalCreditSAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-2 pe-2 py-2.5 hidden lg:table-cell">
                      {isBalanced ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={12} /> {isAr ? 'متوازن' : 'Balanced'}
                        </span>
                      ) : (totalDebitSAR > 0 || totalCreditSAR > 0) ? (
                        <span className="text-xs font-semibold text-red-500">
                          {isAr
                            ? `فرق: ${Math.abs(totalDebitSAR - totalCreditSAR).toFixed(2)}`
                            : `Diff: ${Math.abs(totalDebitSAR - totalCreditSAR).toFixed(2)}`}
                        </span>
                      ) : null}
                    </td>
                    <td className="pe-2 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-border flex items-center justify-between gap-3">
          <div className={cn(
            'inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full',
            isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          )}>
            {isBalanced
              ? <><CheckCircle2 size={14} /> {isAr ? 'القيد متوازن' : 'Entry is balanced'}</>
              : <><Clock size={14} /> {isAr ? 'القيد غير متوازن' : 'Entry not balanced'}</>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              <BookOpen size={15} />
              {saving
                ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
                : (isAr ? 'حفظ القيد' : 'Save Entry')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BSP Tab ──────────────────────────────────────────────────────────────────

interface BspBilling {
  id: string;
  billingPeriod: string;
  netRemitHalalas: number;
  totalSalesHalalas: number;
  totalRefundsHalalas: number;
  totalCommissionHalalas: number;
  dueDate: string;
  status: string;
  currency: string;
}

interface BspAdj {
  id: string;
  type: 'ADM' | 'ACM';
  referenceNumber: string;
  issueDate: string;
  amountHalalas: number;
  reason: string;
  airlineCode: string | null;
  status: string;
}

function BspTab({ isAr, agencyId }: { isAr: boolean; agencyId: string | null }) {
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const [billings, setBillings]   = useState<BspBilling[]>([]);
  const [adjs, setAdjs]           = useState<BspAdj[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showBilling, setShowBilling] = useState(false);
  const [showAdj, setShowAdj]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  const [bForm, setBForm] = useState({
    billingPeriod: new Date().toISOString().slice(0, 7),
    totalSales: '', totalRefunds: '', commission: '', netRemit: '',
    dueDate: '', reference: '', notes: '',
  });
  const [aForm, setAForm] = useState({
    type: 'ADM' as 'ADM' | 'ACM',
    referenceNumber: '', issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '', amount: '', reason: '', airlineCode: '', ticketNumbers: '', notes: '',
  });

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const [bd, ad] = await Promise.all([
          apiFetch<{ billings: BspBilling[] }>('/api/bsp/billings'),
          apiFetch<{ adjustments: BspAdj[] }>('/api/bsp/adjustments'),
        ]);
        if (!cancelled) {
          setBillings(bd.billings ?? []);
          setAdjs(ad.adjustments ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [agencyId]);

  async function saveBilling() {
    setSaving(true); setErr('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const res = await apiFetch<{ id: string; journalEntryId: string }>('/api/bsp/billings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingPeriod:           bForm.billingPeriod,
          totalSalesHalalas:       Math.round(parseFloat(bForm.totalSales   || '0') * 100),
          totalRefundsHalalas:     Math.round(parseFloat(bForm.totalRefunds || '0') * 100),
          totalCommissionHalalas:  Math.round(parseFloat(bForm.commission   || '0') * 100),
          netRemitHalalas:         Math.round(parseFloat(bForm.netRemit     || '0') * 100),
          dueDate:                 bForm.dueDate,
          reference:               bForm.reference || undefined,
          notes:                   bForm.notes     || undefined,
        }),
      });
      setBillings(prev => [{
        id: res.id, billingPeriod: bForm.billingPeriod,
        netRemitHalalas:        Math.round(parseFloat(bForm.netRemit    || '0') * 100),
        totalSalesHalalas:      Math.round(parseFloat(bForm.totalSales  || '0') * 100),
        totalRefundsHalalas:    Math.round(parseFloat(bForm.totalRefunds|| '0') * 100),
        totalCommissionHalalas: Math.round(parseFloat(bForm.commission  || '0') * 100),
        dueDate: bForm.dueDate, status: 'pending', currency: 'SAR',
      }, ...prev]);
      setShowBilling(false);
      setBForm({ billingPeriod: new Date().toISOString().slice(0,7), totalSales:'', totalRefunds:'', commission:'', netRemit:'', dueDate:'', reference:'', notes:'' });
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveAdj() {
    setSaving(true); setErr('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const res = await apiFetch<{ id: string }>('/api/bsp/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:            aForm.type,
          referenceNumber: aForm.referenceNumber,
          issueDate:       aForm.issueDate,
          dueDate:         aForm.dueDate   || undefined,
          amountHalalas:   Math.round(parseFloat(aForm.amount || '0') * 100),
          reason:          aForm.reason,
          airlineCode:     aForm.airlineCode    || undefined,
          ticketNumbers:   aForm.ticketNumbers  || undefined,
          notes:           aForm.notes          || undefined,
        }),
      });
      setAdjs(prev => [{
        id: res.id, type: aForm.type, referenceNumber: aForm.referenceNumber,
        issueDate: aForm.issueDate, amountHalalas: Math.round(parseFloat(aForm.amount||'0')*100),
        reason: aForm.reason, airlineCode: aForm.airlineCode || null, status: 'pending',
      }, ...prev]);
      setShowAdj(false);
      setAForm({ type:'ADM', referenceNumber:'', issueDate: new Date().toISOString().slice(0,10), dueDate:'', amount:'', reason:'', airlineCode:'', ticketNumbers:'', notes:'' });
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  const statusColor = (s: string) => ({
    pending:  'bg-amber-100 text-amber-700',
    paid:     'bg-emerald-100 text-emerald-700',
    overdue:  'bg-red-100 text-red-700',
    disputed: 'bg-purple-100 text-purple-700',
  }[s] ?? 'bg-slate-100 text-slate-600');

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
      <Loader2 size={18} className="animate-spin" />
      {isAr ? 'جارٍ التحميل...' : 'Loading...'}
    </div>
  );

  return (
    <div className="space-y-8">
      {err && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={15} /> {err}
        </div>
      )}

      {/* ── BSP Billings ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            {isAr ? 'فترات BSP' : 'BSP Billing Periods'}
          </h2>
          <Button size="sm" onClick={() => setShowBilling(true)}>
            <Plus size={14} /> {isAr ? 'إضافة فترة' : 'Add Period'}
          </Button>
        </div>

        {billings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <CreditCard size={32} className="opacity-30" />
            <p className="text-sm">{isAr ? 'لا توجد فترات BSP مسجلة' : 'No BSP billing periods recorded'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    isAr ? 'الفترة' : 'Period',
                    isAr ? 'المبيعات' : 'Sales',
                    isAr ? 'الاسترجاعات' : 'Refunds',
                    isAr ? 'العمولات' : 'Commission',
                    isAr ? 'صافي الاستحقاق' : 'Net Remit',
                    isAr ? 'تاريخ الاستحقاق' : 'Due Date',
                    isAr ? 'الحالة' : 'Status',
                  ].map(h => (
                    <th key={h} className="px-4 py-2.5 text-start text-xs font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {billings.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{b.billingPeriod}</td>
                    <td className="px-4 py-3">{formatCurrency(b.totalSalesHalalas, fmtLocale)}</td>
                    <td className="px-4 py-3 text-red-600">({formatCurrency(b.totalRefundsHalalas, fmtLocale)})</td>
                    <td className="px-4 py-3 text-slate-500">{formatCurrency(b.totalCommissionHalalas, fmtLocale)}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(b.netRemitHalalas, fmtLocale)}</td>
                    <td className="px-4 py-3 text-slate-500">{b.dueDate}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(b.status)}`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ADM / ACM ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            {isAr ? 'تسويات ADM / ACM' : 'ADM / ACM Adjustments'}
          </h2>
          <Button size="sm" onClick={() => setShowAdj(true)}>
            <Plus size={14} /> {isAr ? 'إضافة تسوية' : 'Add Adjustment'}
          </Button>
        </div>

        {adjs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <FileText size={32} className="opacity-30" />
            <p className="text-sm">{isAr ? 'لا توجد تسويات مسجلة' : 'No adjustments recorded'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    isAr ? 'النوع' : 'Type',
                    isAr ? 'رقم المرجع' : 'Reference',
                    isAr ? 'تاريخ الإصدار' : 'Issue Date',
                    isAr ? 'المبلغ' : 'Amount',
                    isAr ? 'الخطوط' : 'Airline',
                    isAr ? 'السبب' : 'Reason',
                    isAr ? 'الحالة' : 'Status',
                  ].map(h => (
                    <th key={h} className="px-4 py-2.5 text-start text-xs font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjs.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        a.type === 'ADM' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>{a.type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{a.referenceNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{a.issueDate}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(a.amountHalalas, fmtLocale)}</td>
                    <td className="px-4 py-3 text-slate-500">{a.airlineCode ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{a.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Billing Modal ──────────────────────────────────────────────── */}
      {showBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{isAr ? 'إضافة فترة BSP' : 'Add BSP Billing Period'}</h3>
              <button onClick={() => setShowBilling(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: isAr ? 'الفترة (YYYY-MM)' : 'Period (YYYY-MM)', key: 'billingPeriod', type: 'month' },
                { label: isAr ? 'تاريخ الاستحقاق' : 'Due Date', key: 'dueDate', type: 'date' },
                { label: isAr ? 'إجمالي المبيعات' : 'Total Sales (SAR)', key: 'totalSales', type: 'number' },
                { label: isAr ? 'إجمالي الاسترجاعات' : 'Total Refunds (SAR)', key: 'totalRefunds', type: 'number' },
                { label: isAr ? 'إجمالي العمولات' : 'Total Commission (SAR)', key: 'commission', type: 'number' },
                { label: isAr ? 'صافي الاستحقاق' : 'Net Remit (SAR)', key: 'netRemit', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={bForm[f.key as keyof typeof bForm]}
                    onChange={e => setBForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{isAr ? 'ملاحظات' : 'Notes'}</label>
              <textarea value={bForm.notes} onChange={e => setBForm(p => ({...p, notes: e.target.value}))}
                rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBilling(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{isAr ? 'إلغاء' : 'Cancel'}</button>
              <Button onClick={saveBilling} disabled={saving || !bForm.billingPeriod || !bForm.dueDate || !bForm.netRemit}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {isAr ? 'حفظ' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Adjustment Modal ───────────────────────────────────────────── */}
      {showAdj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{isAr ? 'إضافة تسوية ADM / ACM' : 'Add ADM / ACM Adjustment'}</h3>
              <button onClick={() => setShowAdj(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2">
              {(['ADM', 'ACM'] as const).map(t => (
                <button key={t} onClick={() => setAForm(p => ({...p, type: t}))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    aForm.type === t
                      ? t === 'ADM' ? 'bg-red-600 text-white border-red-600' : 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}>{t}</button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {aForm.type === 'ADM'
                ? (isAr ? 'مذكرة خصم — تحمل تكلفة على الوكالة (DR مصروف ADM / CR مستحقات BSP)' : 'Debit Memo — expense charged to agency (DR ADM Expense / CR BSP Payable)')
                : (isAr ? 'مذكرة دائنة — إيراد لصالح الوكالة (DR مستحقات BSP / CR إيراد استرداد ADM)' : 'Credit Memo — income for agency (DR BSP Payable / CR ADM Recovery Income)')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: isAr ? 'رقم المرجع' : 'Reference Number', key: 'referenceNumber', type: 'text' },
                { label: isAr ? 'تاريخ الإصدار' : 'Issue Date', key: 'issueDate', type: 'date' },
                { label: isAr ? 'تاريخ الاستحقاق' : 'Due Date (optional)', key: 'dueDate', type: 'date' },
                { label: isAr ? 'المبلغ (SAR)' : 'Amount (SAR)', key: 'amount', type: 'number' },
                { label: isAr ? 'رمز الخطوط' : 'Airline Code', key: 'airlineCode', type: 'text' },
                { label: isAr ? 'أرقام التذاكر' : 'Ticket Numbers', key: 'ticketNumbers', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={aForm[f.key as keyof typeof aForm] as string}
                    onChange={e => setAForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{isAr ? 'السبب *' : 'Reason *'}</label>
              <textarea value={aForm.reason} onChange={e => setAForm(p => ({...p, reason: e.target.value}))}
                rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAdj(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{isAr ? 'إلغاء' : 'Cancel'}</button>
              <Button onClick={saveAdj} disabled={saving || !aForm.referenceNumber || !aForm.amount || !aForm.reason}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {isAr ? 'حفظ' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FX Revaluation Tab ────────────────────────────────────────────────────────

interface FxAdjustment {
  accountId: string;
  accountName: string;
  currency: string;
  balanceFx: number;
  oldRateSar: number;
  newRateSar: number;
  gainLossSar: number;
}

function FxRevaluationTab({ isAr, agencyId }: { isAr: boolean; agencyId: string | null }) {
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const today = new Date().toISOString().slice(0, 10);
  const [revalDate, setRevalDate] = useState(today);
  const [preview, setPreview]     = useState<FxAdjustment[] | null>(null);
  const [loading, setLoading]     = useState(false);
  const [running, setRunning]     = useState(false);
  const [result, setResult]       = useState<{ success?: boolean; journalEntryIds?: string[]; alreadyDone?: boolean; message?: string } | null>(null);
  const [err, setErr]             = useState('');

  async function runDryRun() {
    if (!agencyId) return;
    setLoading(true); setErr(''); setPreview(null); setResult(null);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ adjustments: FxAdjustment[] }>('/api/accounting/fx-revaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revaluationDate: revalDate, dryRun: true }),
      });
      setPreview(data.adjustments ?? []);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runRevaluation() {
    if (!agencyId) return;
    setRunning(true); setErr(''); setResult(null);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ success?: boolean; alreadyDone?: boolean; message?: string; journalEntryIds?: string[] }>('/api/accounting/fx-revaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revaluationDate: revalDate, dryRun: false }),
      });
      setResult(data);
      setPreview(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunning(false);
    }
  }

  const totalGainLoss = preview ? preview.reduce((s, a) => s + a.gainLossSar, 0) : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">{isAr ? 'معيار IAS 21 — إعادة تقييم العملة الأجنبية' : 'IAS 21 — Foreign Currency Revaluation'}</p>
        <p className="text-blue-700 text-xs">
          {isAr
            ? 'يعيد هذا الإجراء تقييم جميع الأصول والالتزامات النقدية بالعملة الأجنبية إلى سعر الصرف الحالي، ويسجل فروق العملة غير المحققة في قيود اليومية.'
            : 'Revalues all foreign-currency monetary items (bank accounts) to the current exchange rate and records unrealised FX gains/losses as journal entries.'}
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{isAr ? 'تاريخ إعادة التقييم' : 'Revaluation Date'}</label>
            <input
              type="date"
              value={revalDate}
              onChange={e => { setRevalDate(e.target.value); setPreview(null); setResult(null); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={runDryRun}
            disabled={loading || running}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {isAr ? 'معاينة' : 'Preview'}
          </button>
          {preview && preview.length > 0 && (
            <Button onClick={runRevaluation} disabled={running}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {isAr ? 'تطبيق إعادة التقييم' : 'Apply Revaluation'}
            </Button>
          )}
        </div>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {result?.alreadyDone && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <Clock size={14} /> {result.message ?? (isAr ? 'تم إعادة التقييم بالفعل في هذا التاريخ' : 'Already revalued for this date')}
          </div>
        )}

        {result?.success && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            <CheckCircle2 size={14} />
            {isAr
              ? `تمت إعادة التقييم بنجاح — ${result.journalEntryIds?.length ?? 0} قيد محاسبي`
              : `Revaluation applied — ${result.journalEntryIds?.length ?? 0} journal entries created`}
          </div>
        )}

        {preview !== null && (
          preview.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              {isAr ? 'لا توجد تعديلات مطلوبة — أسعار الصرف محدثة' : 'No adjustments needed — exchange rates are current'}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  {isAr ? `${preview.length} حساب يحتاج إعادة تقييم` : `${preview.length} account(s) require revaluation`}
                </p>
                <p className={`text-sm font-semibold ${totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss, fmtLocale)}
                  {' '}({isAr ? (totalGainLoss >= 0 ? 'ربح' : 'خسارة') : (totalGainLoss >= 0 ? 'gain' : 'loss')})
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {[
                        isAr ? 'الحساب' : 'Account',
                        isAr ? 'العملة' : 'Currency',
                        isAr ? 'الرصيد (FX)' : 'Balance (FX)',
                        isAr ? 'سعر قديم' : 'Old Rate',
                        isAr ? 'سعر جديد' : 'New Rate',
                        isAr ? 'الربح / الخسارة' : 'Gain / Loss',
                      ].map(h => (
                        <th key={h} className="px-4 py-2.5 text-start text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map(a => (
                      <tr key={a.accountId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-medium text-slate-800">{a.accountName}</td>
                        <td className="px-4 py-3"><span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{a.currency}</span></td>
                        <td className="px-4 py-3">{a.balanceFx.toLocaleString(fmtLocale, { maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-slate-500">{a.oldRateSar.toFixed(4)}</td>
                        <td className="px-4 py-3 text-slate-500">{a.newRateSar.toFixed(4)}</td>
                        <td className={`px-4 py-3 font-semibold ${a.gainLossSar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {a.gainLossSar >= 0 ? '+' : ''}{formatCurrency(a.gainLossSar, fmtLocale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabId = 'chart' | 'journal' | 'currencies' | 'trial-balance' | 'bsp' | 'fx';

export default function AccountingPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? null;

  const [activeTab, setActiveTab] = useState<TabId>('chart');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fixingCodes, setFixingCodes] = useState(false);
  const [fixResult, setFixResult] = useState<{ total: number } | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    async function load() {
      setLoadingEntries(true);
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const data = await apiFetch<{ entries: Record<string, unknown>[] }>('/api/accounting/journal?lines=1');
        if (cancelled) return;
        const sorted = data.entries
          .map(d => fsDocToEntry(String(d['entryNumber'] ?? d['id']), d))
          .sort((a, b) => b.date.getTime() - a.date.getTime());
        setEntries(sorted);
      } finally {
        if (!cancelled) setLoadingEntries(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [agencyId, refreshKey]);

  async function handleFixJournalCodes() {
    setFixingCodes(true);
    setFixResult(null);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ total: number }>('/api/accounting/fix-journal-codes', { method: 'POST' });
      setFixResult(data);
      setRefreshKey(k => k + 1);
    } catch {
      // server returns 403 for non-admin; user will see no result
    } finally {
      setFixingCodes(false);
    }
  }

  const tabs: { id: TabId; labelAr: string; labelEn: string; icon: ReactNode }[] = [
    { id: 'chart',         labelAr: 'شجرة الحسابات',   labelEn: 'Chart of Accounts', icon: <ListTree size={16} /> },
    { id: 'journal',       labelAr: 'قيود اليومية',     labelEn: 'Journal Entries',   icon: <BookOpen size={16} /> },
    { id: 'trial-balance', labelAr: 'ميزان المراجعة',   labelEn: 'Trial Balance',     icon: <Scale size={16} /> },
    { id: 'currencies',    labelAr: 'العملات',           labelEn: 'Currencies',        icon: <DollarSign size={16} /> },
    { id: 'bsp',           labelAr: 'BSP / ADM / ACM',  labelEn: 'BSP / ADM / ACM',   icon: <CreditCard size={16} /> },
    { id: 'fx',            labelAr: 'إعادة تقييم العملة', labelEn: 'FX Revaluation',  icon: <Repeat2 size={16} /> },
  ];

  return (
    <UpgradeGate feature="accounting">
    <div className="space-y-6">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'المحاسبة' : 'Accounting'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? 'دليل الحسابات والقيود اليومية وميزان المراجعة'
              : 'Chart of accounts, journal entries, and trial balance'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
            <Download size={15} />
            {isAr ? 'تصدير Excel' : 'Export Excel'}
          </button>
          {activeTab === 'journal' && (
            <Button onClick={() => setShowNewEntry(true)}>
              <Plus size={15} />
              {isAr ? 'قيد جديد' : 'New Entry'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp size={20} />}
          iconBg="bg-brand-50"
          iconColor="text-brand-600"
          label={isAr ? 'إجمالي المدين' : 'Total Debit'}
          value={loadingEntries ? '...' : formatCurrency(entries.reduce((s, e) => s + entryTotalDebit(e), 0), fmtLocale)}
          sub={loadingEntries ? '' : `${formatCount(entries.length, fmtLocale)} ${isAr ? 'قيد' : 'entries'}`}
        />
        <StatCard
          icon={<TrendingDown size={20} />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          label={isAr ? 'إجمالي الدائن' : 'Total Credit'}
          value={loadingEntries ? '...' : formatCurrency(entries.reduce((s, e) => s + entryTotalCredit(e), 0), fmtLocale)}
        />
        <StatCard
          icon={<Layers size={20} />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label={isAr ? 'قيود متوازنة' : 'Balanced Entries'}
          value={loadingEntries ? '...' : `${formatCount(entries.filter((e) => e.status === 'balanced').length, fmtLocale)} / ${formatCount(entries.length, fmtLocale)}`}
        />
        <StatCard
          icon={<BarChart3 size={20} />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          label={isAr ? 'مسودات' : 'Draft Entries'}
          value={loadingEntries ? '...' : formatCount(entries.filter((e) => e.status === 'draft').length, fmtLocale)}
          sub={isAr ? 'بانتظار الترحيل' : 'Pending posting'}
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div>
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-surface-border mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
                'border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              )}
            >
              {tab.icon}
              {isAr ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {activeTab === 'chart' && (
          <ChartOfAccountsClient locale={locale} />
        )}

        {activeTab === 'journal' && (
          loadingEntries ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
              {isAr ? 'جارٍ تحميل القيود...' : 'Loading entries...'}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <BookOpen size={36} className="opacity-30" />
              <p className="text-sm">{isAr ? 'لا توجد قيود محاسبية بعد' : 'No journal entries yet'}</p>
              <p className="text-xs">{isAr ? 'ستظهر القيود تلقائياً عند إنشاء الفواتير والمدفوعات' : 'Entries appear automatically when invoices and payments are created'}</p>
            </div>
          ) : (
            <JournalEntriesTab isAr={isAr} fmtLocale={fmtLocale} entries={entries} />
          )
        )}

        {activeTab === 'trial-balance' && (
          <TrialBalanceTab locale={locale} />
        )}

        {activeTab === 'currencies' && (
          <CurrenciesClient locale={locale} />
        )}

        {activeTab === 'bsp' && (
          <BspTab isAr={isAr} agencyId={agencyId} />
        )}

        {activeTab === 'fx' && (
          <FxRevaluationTab isAr={isAr} agencyId={agencyId} />
        )}

        {/* Data maintenance — only shown in journal tab */}
        {activeTab === 'journal' && (
          <div className="mt-8 pt-6 border-t border-slate-200">
            <details className="group">
              <summary className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none list-none">
                <Wrench size={13} />
                {isAr ? 'أدوات الصيانة' : 'Maintenance Tools'}
              </summary>
              <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                <p className="text-xs text-amber-800 font-medium">
                  {isAr
                    ? 'إصلاح رموز الحسابات في سندات الصرف القديمة (تشغيل مرة واحدة)'
                    : 'Fix account codes on old supplier payments (run once)'}
                </p>
                <p className="text-xs text-amber-700">
                  {isAr
                    ? 'يصحح هذا الإجراء رموز الحسابات الخاطئة التي أُدخلت قبل الإصلاح: 5900→5400، 5100(تشغيلي)→5400، 5200(رواتب)→5100.'
                    : 'Corrects wrong account codes entered before the fix: 5900→5400, 5100(operational)→5400, 5200(salaries)→5100.'}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleFixJournalCodes}
                    disabled={fixingCodes}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    <Wrench size={12} />
                    {fixingCodes
                      ? (isAr ? 'جارٍ الإصلاح...' : 'Fixing...')
                      : (isAr ? 'تشغيل الإصلاح' : 'Run Fix')}
                  </button>
                  {fixResult !== null && (
                    <span className="text-xs text-emerald-700 font-medium">
                      {isAr
                        ? `تم إصلاح ${fixResult.total} سطر`
                        : `${fixResult.total} lines fixed`}
                      {fixResult.total === 0 && (isAr ? ' — لا شيء يحتاج إصلاح' : ' — nothing to fix')}
                    </span>
                  )}
                </div>
              </div>
            </details>
          </div>
        )}

      </div>

      {/* New Entry Modal */}
      {showNewEntry && (
        <NewEntryModal
          isAr={isAr}
          agencyId={agencyId}
          onClose={() => setShowNewEntry(false)}
          onSave={(entry) => setEntries(prev => [entry, ...prev])}
        />
      )}
    </div>
    </UpgradeGate>
  );
}
