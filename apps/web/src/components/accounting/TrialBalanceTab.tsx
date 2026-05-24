'use client';

import { useMemo } from 'react';
import { useChartOfAccounts } from '@/hooks/useChartOfAccounts';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/utils';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export function TrialBalanceTab({ locale }: { locale: string }) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { accounts, loading, error } = useChartOfAccounts();

  const { rows, totalDebit, totalCredit } = useMemo(() => {
    const rows = accounts
      .filter(a => a.balanceHalalas !== 0)
      .map(a => {
        const isDebitNormal = a.type === 'asset' || a.type === 'expense';
        return {
          ...a,
          debitHalalas:  isDebitNormal  ? Math.max(0, a.balanceHalalas) : 0,
          creditHalalas: !isDebitNormal ? Math.max(0, a.balanceHalalas) : 0,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalDebit  = rows.reduce((s, r) => s + r.debitHalalas,  0);
    const totalCredit = rows.reduce((s, r) => s + r.creditHalalas, 0);
    return { rows, totalDebit, totalCredit };
  }, [accounts]);

  const diff       = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff === 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <AlertTriangle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Balance status banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
        isBalanced
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}>
        {isBalanced ? (
          <>
            <CheckCircle2 size={16} className="flex-shrink-0" />
            {isAr ? 'الميزان متوازن — المدين يساوي الدائن' : 'Trial Balance is Balanced — Debit = Credit'}
          </>
        ) : (
          <>
            <AlertTriangle size={16} className="flex-shrink-0" />
            {isAr
              ? `الميزان غير متوازن — الفرق: ${formatCurrency(diff, fmtLocale)}`
              : `Trial Balance is Unbalanced — Difference: ${formatCurrency(diff, fmtLocale)}`}
          </>
        )}
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border bg-slate-50/60">
                <th className="text-start ps-5 pe-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                  {isAr ? 'الكود' : 'Code'}
                </th>
                <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'اسم الحساب' : 'Account Name'}
                </th>
                <th className="text-start px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                  {isAr ? 'النوع' : 'Type'}
                </th>
                <th className="text-end px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'مدين' : 'Debit'}
                </th>
                <th className="text-end pe-5 px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'دائن' : 'Credit'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                    {isAr ? 'لا توجد أرصدة بعد — ابدأ بإنشاء الفواتير والمدفوعات' : 'No balances yet — start by creating invoices and payments'}
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="ps-5 pe-3 py-3">
                      <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {row.code}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-slate-800 font-medium">
                        {isAr ? row.nameAr : (row.nameEn || row.nameAr)}
                      </p>
                      {!isAr && row.nameAr && (
                        <p className="text-xs text-slate-400 mt-0.5" dir="rtl">{row.nameAr}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <span className="text-xs text-slate-500">
                        {isAr
                          ? { asset: 'أصول', liability: 'التزامات', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصاريف' }[row.type]
                          : row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-end">
                      {row.debitHalalas > 0 ? (
                        <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatCurrency(row.debitHalalas, fmtLocale)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="pe-5 px-3 py-3 text-end">
                      {row.creditHalalas > 0 ? (
                        <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatCurrency(row.creditHalalas, fmtLocale)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-300">
                <td colSpan={3} className="ps-5 pe-3 py-3.5">
                  <span className="text-sm font-bold text-slate-700">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-end">
                  <span className={`text-sm font-bold font-mono tabular-nums ${isBalanced ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrency(totalDebit, fmtLocale)}
                  </span>
                </td>
                <td className="pe-5 px-3 py-3.5 text-end">
                  <span className={`text-sm font-bold font-mono tabular-nums ${isBalanced ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrency(totalCredit, fmtLocale)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="text-xs text-slate-400 text-center">
        {isAr
          ? 'يُحدَّث الميزان تلقائياً مع كل فاتورة أو دفعة جديدة'
          : 'Trial balance updates automatically with each new invoice or payment'}
      </p>
    </div>
  );
}
