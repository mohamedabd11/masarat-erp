'use client';

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Search } from 'lucide-react';
import { useArAging } from '@/hooks/useArAging';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/utils';

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ArAgingTab() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [search, setSearch] = useState('');
  const { rows, summary, reconciliation, detailSnapshotDate, historicalDetailAvailable, loading, error, reload } = useArAging(asOf);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      row.customerNameAr.toLowerCase().includes(query)
      || (row.customerNameEn ?? '').toLowerCase().includes(query),
    );
  }, [rows, search]);

  const currentTotal = summary.current + summary.days1to30;
  const cards = [
    { key: 'current', labelAr: 'حالي وحتى 30 يوماً', labelEn: 'Current to 30 days', amount: currentTotal, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { key: '31-60', labelAr: '31–60 يوماً', labelEn: '31–60 days', amount: summary.days31to60, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
    { key: '61-90', labelAr: '61–90 يوماً', labelEn: '61–90 days', amount: summary.days61to90, tone: 'text-orange-700 bg-orange-50 border-orange-200' },
    { key: '91+', labelAr: 'أكثر من 90 يوماً', labelEn: 'Over 90 days', amount: summary.days91plus, tone: 'text-red-700 bg-red-50 border-red-200' },
  ];

  function exportCsv() {
    downloadCSV([
      [isAr ? 'العميل' : 'Customer', isAr ? 'عدد الفواتير' : 'Invoices', isAr ? 'حالي وحتى 30' : 'Current to 30', '31-60', '61-90', '91+', isAr ? 'الإجمالي' : 'Total'],
      ...filtered.map((row) => [
        isAr ? row.customerNameAr : (row.customerNameEn || row.customerNameAr),
        row.invoiceCount,
        (row.current + row.days1to30) / 100,
        row.days31to60 / 100,
        row.days61to90 / 100,
        row.days91plus / 100,
        row.totalOutstanding / 100,
      ]),
      [],
      [isAr ? 'رصيد دفتر الحسابات 1120' : 'GL account 1120', '', '', '', '', '', (reconciliation?.glReceivableBalance ?? 0) / 100],
      [isAr ? 'فرق المطابقة' : 'Reconciliation difference', '', '', '', '', '', (reconciliation?.difference ?? 0) / 100],
    ], `ذمم-العملاء-${asOf}.csv`);
  }

  return (
    <div className="space-y-5">
      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">{isAr ? 'كما في تاريخ' : 'As of date'}</label>
            <input type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button type="button" onClick={() => selectedDate === asOf ? reload() : setAsOf(selectedDate)} disabled={loading || !selectedDate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            <RefreshCw size={14} />{isAr ? 'تحديث' : 'Refresh'}
          </button>
          <button type="button" onClick={exportCsv} disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            <Download size={14} />CSV
          </button>
        </div>
      </Card>

      {error ? <Card><p className="text-red-600 text-sm py-4 text-center">{error}</p></Card> : null}
      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div> : null}

      {!loading && reconciliation ? (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${reconciliation.reconciled ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
          {reconciliation.reconciled ? <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-bold">
              {reconciliation.reconciled
                ? (isAr ? 'أعمار الذمم مطابقة لدفتر الحسابات' : 'Aging reconciles to the general ledger')
                : (isAr ? 'يوجد فرق بين تفاصيل العملاء ودفتر الحسابات' : 'Customer detail differs from the general ledger')}
            </p>
            <p className="text-xs mt-0.5">
              {isAr ? 'رصيد الحساب 1120: ' : 'GL 1120 balance: '}{formatCurrency(reconciliation.glReceivableBalance, fmtLocale)}
              {' · '}{isAr ? 'الفرق: ' : 'Difference: '}{formatCurrency(reconciliation.difference, fmtLocale)}
            </p>
          </div>
        </div>
      ) : null}

      {!loading && !historicalDetailAvailable ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-50 border-amber-300 text-amber-800 text-sm">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <p>
            {isAr
              ? `تفاصيل العملاء تعتمد حالة السداد المحفوظة بتاريخ ${detailSnapshotDate}. رصيد دفتر الحسابات في التاريخ السابق دقيق، أما توزيعه على العملاء فهو تقريبي حتى إضافة سجل تاريخي للتخصيص.`
              : `Customer detail uses payment state saved at ${detailSnapshotDate}. The historical GL balance is exact, while customer allocation is approximate until allocation history is added.`}
          </p>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map((card) => (
              <div key={card.key} className={`rounded-2xl border p-4 ${card.tone}`}>
                <p className="text-xs font-bold mb-2">{isAr ? card.labelAr : card.labelEn}</p>
                <p className="text-xl font-extrabold tabular-nums">{formatCurrency(card.amount, fmtLocale)}</p>
              </div>
            ))}
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{isAr ? 'إجمالي تفاصيل العملاء' : 'Total customer detail'}</p>
                <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{formatCurrency(summary.totalOutstanding, fmtLocale)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{rows.reduce((sum, row) => sum + row.invoiceCount, 0)} {isAr ? 'فاتورة مفتوحة' : 'open invoice(s)'}</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder={isAr ? 'بحث باسم العميل...' : 'Search customer...'}
                  className="w-full ps-9 pe-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card><p className="text-sm text-slate-400 text-center py-10">{isAr ? 'لا توجد ذمم مدينة مفتوحة' : 'No open receivables'}</p></Card>
          ) : (
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <th className="text-start px-5 py-3">{isAr ? 'العميل' : 'Customer'}</th>
                    <th className="text-center px-3 py-3">{isAr ? 'الفواتير' : 'Invoices'}</th>
                    <th className="text-end px-3 py-3">{isAr ? 'حالي–30' : 'Current–30'}</th>
                    <th className="text-end px-3 py-3">31–60</th>
                    <th className="text-end px-3 py-3">61–90</th>
                    <th className="text-end px-3 py-3">91+</th>
                    <th className="text-end px-5 py-3">{isAr ? 'الإجمالي' : 'Total'}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((row) => (
                      <tr key={row.customerId ?? `walkin-${row.customerNameAr}`} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-semibold text-slate-800">{isAr ? row.customerNameAr : (row.customerNameEn || row.customerNameAr)}</td>
                        <td className="px-3 py-3 text-center text-slate-500">{row.invoiceCount}</td>
                        <td className="px-3 py-3 text-end tabular-nums">{formatCurrency(row.current + row.days1to30, fmtLocale)}</td>
                        <td className="px-3 py-3 text-end tabular-nums text-amber-700">{formatCurrency(row.days31to60, fmtLocale)}</td>
                        <td className="px-3 py-3 text-end tabular-nums text-orange-700">{formatCurrency(row.days61to90, fmtLocale)}</td>
                        <td className="px-3 py-3 text-end tabular-nums text-red-700">{formatCurrency(row.days91plus, fmtLocale)}</td>
                        <td className="px-5 py-3 text-end font-bold tabular-nums">{formatCurrency(row.totalOutstanding, fmtLocale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
