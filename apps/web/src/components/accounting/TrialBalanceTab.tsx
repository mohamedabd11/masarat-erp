'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TbRow {
  code:          string;
  nameAr:        string;
  nameEn:        string | null;
  type:          'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openDebit:     number;
  openCredit:    number;
  periodDebit:   number;
  periodCredit:  number;
  totalDebit:    number;
  totalCredit:   number;
  balance:       number;
  isDebitNormal: boolean;
}

interface TbResponse {
  asOf:             string;
  from:             string | null;
  rows:             TbRow[];
  grandTotalDebit:  number;
  grandTotalCredit: number;
  isBalanced:       boolean;
  error?:           string;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<TbRow['type'], { labelAr: string; labelEn: string; bgColor: string; textColor: string }> = {
  asset:     { labelAr: 'الأصول',        labelEn: 'Assets',      bgColor: 'bg-blue-50/70',    textColor: 'text-blue-800'   },
  liability: { labelAr: 'الالتزامات',    labelEn: 'Liabilities', bgColor: 'bg-red-50/70',     textColor: 'text-red-800'    },
  equity:    { labelAr: 'حقوق الملكية',  labelEn: 'Equity',      bgColor: 'bg-purple-50/70',  textColor: 'text-purple-800' },
  revenue:   { labelAr: 'الإيرادات',     labelEn: 'Revenue',     bgColor: 'bg-emerald-50/70', textColor: 'text-emerald-800'},
  expense:   { labelAr: 'المصاريف',      labelEn: 'Expenses',    bgColor: 'bg-amber-50/70',   textColor: 'text-amber-800'  },
};

const CATEGORIES: TbRow['type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

// ─── Component ────────────────────────────────────────────────────────────────

export function TrialBalanceTab({ locale }: { locale: string }) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const today = new Date().toISOString().slice(0, 10);
  const [asOf,    setAsOf]    = useState(today);
  const [from,    setFrom]    = useState('');
  const [data,    setData]    = useState<TbResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [expanded, setExpanded] = useState<Set<TbRow['type']>>(
    new Set<TbRow['type']>(CATEGORIES)
  );

  const toggleCat = (c: TbRow['type']) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(c) ? next.delete(c) : next.add(c);
    return next;
  });

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams({ asOf });
    if (from) params.set('from', from);
    fetch(`/api/accounting/trial-balance?${params}`)
      .then(r => r.json())
      .then((d: TbResponse) => {
        if (d.error) { setErr(d.error); return; }
        setData(d);
      })
      .catch(() => setErr(isAr ? 'تعذّر تحميل البيانات' : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [asOf, from, isAr]);

  useEffect(() => { load(); }, [load]);

  const rows            = data?.rows ?? [];
  const grandTotalDebit = data?.grandTotalDebit  ?? 0;
  const grandTotalCredit= data?.grandTotalCredit ?? 0;
  const isBalanced      = data?.isBalanced       ?? true;

  return (
    <div className="space-y-5">
      {/* ── Date controls ─────────────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              {isAr ? 'كما في تاريخ' : 'As of Date'}
            </label>
            <input
              type="date" value={asOf}
              onChange={e => setAsOf(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">
              {isAr ? 'من تاريخ (اختياري)' : 'From Date (optional)'}
            </label>
            <input
              type="date" value={from}
              onChange={e => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={load} disabled={loading}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
          {data?.asOf && (
            <p className="text-xs text-slate-400 self-end pb-2">
              {isAr ? `كما في: ${data.asOf}` : `As of: ${data.asOf}`}
              {data.from ? (isAr ? ` — من: ${data.from}` : ` — from: ${data.from}`) : ''}
            </p>
          )}
        </div>
      </Card>

      {err && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} /> {err}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
          <Loader2 size={18} className="animate-spin" />
          {isAr ? 'جارٍ التحميل...' : 'Loading...'}
        </div>
      )}

      {/* ── Balance status ─────────────────────────────────────────────────── */}
      {data && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold',
          isBalanced
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800',
        )}>
          {isBalanced ? <CheckCircle2 size={16} className="flex-shrink-0" /> : <AlertCircle size={16} className="flex-shrink-0" />}
          {isBalanced
            ? (isAr ? 'الميزان متوازن — المدين يساوي الدائن' : 'Trial Balance is Balanced — Debit = Credit')
            : (isAr
                ? `تحذير: الميزان غير متوازن — الفرق: ${formatCurrency(Math.abs(grandTotalDebit - grandTotalCredit), fmtLocale)}`
                : `Warning: Unbalanced — Difference: ${formatCurrency(Math.abs(grandTotalDebit - grandTotalCredit), fmtLocale)}`)}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {data && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">
                    {isAr ? 'الكود' : 'Code'}
                  </th>
                  <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'اسم الحساب' : 'Account Name'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'إجمالي مدين' : 'Total Debit'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'إجمالي دائن' : 'Total Credit'}
                  </th>
                  <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'رصيد مدين' : 'Balance Dr'}
                  </th>
                  <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'رصيد دائن' : 'Balance Cr'}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                      {isAr
                        ? 'لا توجد حركات في هذه الفترة'
                        : 'No movements in this period'}
                    </td>
                  </tr>
                ) : (
                  CATEGORIES.map(cat => {
                    const meta      = CATEGORY_META[cat];
                    const catRows   = rows.filter(r => r.type === cat);
                    if (catRows.length === 0) return null;

                    const catTotD = catRows.reduce((s, r) => s + r.totalDebit,  0);
                    const catTotC = catRows.reduce((s, r) => s + r.totalCredit, 0);
                    const catBalD = catRows.filter(r =>  r.isDebitNormal).reduce((s, r) => s + Math.max(0, r.balance), 0)
                                  + catRows.filter(r => !r.isDebitNormal).reduce((s, r) => s + Math.max(0, r.totalDebit  - r.totalCredit), 0);
                    const catBalC = catRows.filter(r => !r.isDebitNormal).reduce((s, r) => s + Math.max(0, r.balance), 0)
                                  + catRows.filter(r =>  r.isDebitNormal).reduce((s, r) => s + Math.max(0, r.totalCredit - r.totalDebit),  0);
                    const isOpen  = expanded.has(cat);

                    return (
                      <>
                        {/* Category header row */}
                        <tr
                          key={`cat-${cat}`}
                          className={cn('cursor-pointer hover:brightness-95 transition-all', meta.bgColor)}
                          onClick={() => toggleCat(cat)}
                        >
                          <td colSpan={2} className="ps-4 pe-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                              <span className={cn('text-sm font-bold', meta.textColor)}>
                                {isAr ? meta.labelAr : meta.labelEn}
                              </span>
                              <span className="text-xs text-slate-400 font-normal">({catRows.length})</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-end text-sm font-semibold tabular-nums font-mono text-slate-700">{catTotD > 0 ? formatCurrency(catTotD, fmtLocale) : '—'}</td>
                          <td className="px-3 py-2.5 text-end text-sm font-semibold tabular-nums font-mono text-slate-700">{catTotC > 0 ? formatCurrency(catTotC, fmtLocale) : '—'}</td>
                          <td className="px-3 py-2.5 text-end text-sm font-bold tabular-nums font-mono text-slate-900">{catBalD > 0 ? formatCurrency(catBalD, fmtLocale) : '—'}</td>
                          <td className="pe-5 px-3 py-2.5 text-end text-sm font-bold tabular-nums font-mono text-slate-900">{catBalC > 0 ? formatCurrency(catBalC, fmtLocale) : '—'}</td>
                        </tr>

                        {/* Account rows */}
                        {isOpen && catRows.map(r => {
                          const balDr = r.isDebitNormal
                            ? Math.max(0, r.totalDebit  - r.totalCredit)
                            : Math.max(0, r.totalDebit  - r.totalCredit);  // debit surplus on credit-normal account
                          const balCr = !r.isDebitNormal
                            ? Math.max(0, r.totalCredit - r.totalDebit)
                            : Math.max(0, r.totalCredit - r.totalDebit);   // credit surplus on debit-normal account
                          return (
                            <tr key={r.code} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                              <td className="ps-5 pe-3 py-2.5">
                                <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{r.code}</span>
                              </td>
                              <td className="ps-6 pe-3 py-2.5 text-slate-700">{isAr ? r.nameAr : (r.nameEn || r.nameAr)}</td>
                              <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{r.totalDebit  > 0 ? formatCurrency(r.totalDebit,  fmtLocale) : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{r.totalCredit > 0 ? formatCurrency(r.totalCredit, fmtLocale) : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{balDr > 0 ? formatCurrency(balDr, fmtLocale) : <span className="text-slate-300">—</span>}</td>
                              <td className="pe-5 px-3 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{balCr > 0 ? formatCurrency(balCr, fmtLocale) : <span className="text-slate-300">—</span>}</td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })
                )}
              </tbody>

              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td colSpan={2} className="ps-5 pe-3 py-3.5">
                    <span className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      {isAr ? 'الإجمالي الكلي' : 'Grand Total'}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(grandTotalDebit,  fmtLocale)}</td>
                  <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(grandTotalCredit, fmtLocale)}</td>
                  <td className={cn('px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono', isBalanced ? 'text-brand-700' : 'text-red-600')}>{formatCurrency(grandTotalDebit,  fmtLocale)}</td>
                  <td className={cn('pe-5 px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono', isBalanced ? 'text-brand-700' : 'text-red-600')}>{formatCurrency(grandTotalCredit, fmtLocale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
