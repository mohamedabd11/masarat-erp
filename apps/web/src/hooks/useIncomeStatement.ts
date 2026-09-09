'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { incomeStatementPeriod, type ProfitLossResponse } from '@/lib/income-statement-model';

export interface AccountLine {
  code:    string;
  nameAr:  string;
  nameEn:  string;
  halalas: number;
}

export interface IncomeStatementData {
  revenueLines:  AccountLine[];
  expenseLines:  AccountLine[];
  totalRevenue:  number;
  totalExpense:  number;
  grossProfit:   number;
  netProfit:     number;
  grossMargin:   number;
  netMargin:     number;
  loading:       boolean;
  error:         boolean;
  period:        { from: string; to: string };
  year:          number;
  quarter:       0 | 1 | 2 | 3 | 4;
  setYear:       (y: number) => void;
  setQuarter:    (q: 0 | 1 | 2 | 3 | 4) => void;
  fromDate:      Date;
  toDate:        Date;
}

export interface IncomeStatementAccount {
  code: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | string;
}

export function useIncomeStatement(): IncomeStatementData {
  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const period = useMemo(() => incomeStatementPeriod(year, quarter), [year, quarter]);
  const invalidPeriod = period.from > period.to;
  const key = `${agencyId}:${period.from}:${period.to}`;
  const [result, setResult] = useState<{ key: string; data: ProfitLossResponse | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!agencyId || invalidPeriod) return;
    let cancelled = false;
    setResult(null);
    const params = new URLSearchParams({ from: period.from, to: period.to });
    apiFetch<ProfitLossResponse>(`/api/reports/pl?${params}`)
      .then(data => { if (!cancelled) setResult({ key, data, error: false }); })
      .catch(() => { if (!cancelled) setResult({ key, data: null, error: true }); });
    return () => { cancelled = true; };
  }, [agencyId, invalidPeriod, key, period]);
  const current = agencyId && result?.key === key ? result : null;
  const data = current?.data;
  const lines = (rows: ProfitLossResponse['revenue'] = []): AccountLine[] => rows
    .filter(row => row.balance !== 0)
    .map(row => ({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn ?? row.code, halalas: row.balance }));
  const revenueLines = lines(data?.revenue), expenseLines = lines(data?.expenses);
  const totalRevenue = data?.totalRevenue ?? 0, totalExpense = data?.totalExpenses ?? 0;
  // Retain the existing standard cost-of-services mapping; custom gross-profit
  // categories require a separate chart/report mapping audit.
  const costOfServices = expenseLines.find(row => row.code === '5000')?.halalas ?? 0;
  const grossProfit = totalRevenue - costOfServices, netProfit = data?.netIncome ?? 0;
  const changeYear = (nextYear: number) => {
    if (nextYear === new Date().getUTCFullYear() && quarter > Math.floor(new Date().getUTCMonth() / 3) + 1) setQuarter(0);
    setYear(nextYear);
  };
  return {
    revenueLines, expenseLines, totalRevenue, totalExpense, grossProfit, netProfit,
    grossMargin: totalRevenue > 0 ? Math.round(grossProfit / totalRevenue * 100) : 0,
    netMargin: totalRevenue > 0 ? Math.round(netProfit / totalRevenue * 100) : 0,
    loading: !!agencyId && !current && !invalidPeriod,
    error: invalidPeriod || (current?.error ?? false), period, year, quarter, setYear: changeYear, setQuarter,
    fromDate: new Date(`${period.from}T00:00:00Z`),
    toDate: new Date(new Date(`${period.to}T00:00:00Z`).getTime() + 86_400_000),
  };
}
