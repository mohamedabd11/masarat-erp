'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';

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
  year:          number;
  quarter:       0 | 1 | 2 | 3 | 4;
  setYear:       (y: number) => void;
  setQuarter:    (q: 0 | 1 | 2 | 3 | 4) => void;
  fromDate:      Date;
  toDate:        Date;
}

interface JournalLineRow {
  accountCode:   string;
  accountNameAr: string | null;
  accountNameEn: string | null;
  debitHalalas:  number;
  creditHalalas: number;
}

interface JournalEntryRow {
  date:  string;
  lines: JournalLineRow[];
}

function quarterRange(year: number, quarter: 0 | 1 | 2 | 3 | 4): [Date, Date] {
  if (quarter === 0) return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
  const startMonth = (quarter - 1) * 3;
  return [new Date(year, startMonth, 1), new Date(year, startMonth + 3, 1)];
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

export function useIncomeStatement(): IncomeStatementData {
  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;

  const [year,    setYear]    = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [loading, setLoading] = useState(true);

  const [revenueMap, setRevenueMap] = useState<Map<string, AccountLine>>(new Map());
  const [expenseMap, setExpenseMap] = useState<Map<string, AccountLine>>(new Map());

  const [fromDate, toDate] = useMemo(() => quarterRange(year, quarter), [year, quarter]);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      from:  toISODate(fromDate),
      to:    toISODate(toDate),
      lines: '1',
    });

    apiFetch<{ entries: JournalEntryRow[] }>(`/api/accounting/journal?${params}`)
      .then(data => {
        if (cancelled) return;
        const rev = new Map<string, AccountLine>();
        const exp = new Map<string, AccountLine>();

        for (const entry of data.entries) {
          for (const line of (entry.lines ?? [])) {
            const code   = line.accountCode;
            const debit  = line.debitHalalas;
            const credit = line.creditHalalas;
            const nameAr = line.accountNameAr ?? code;
            const nameEn = line.accountNameEn ?? code;
            const c = code.charAt(0);
            if (c === '4' && credit > 0) {
              const ex = rev.get(code);
              rev.set(code, { code, nameAr, nameEn, halalas: (ex?.halalas ?? 0) + credit });
            }
            if (c === '5' && debit > 0) {
              const ex = exp.get(code);
              exp.set(code, { code, nameAr, nameEn, halalas: (ex?.halalas ?? 0) + debit });
            }
          }
        }
        setRevenueMap(rev);
        setExpenseMap(exp);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId, fromDate, toDate]);

  return useMemo(() => {
    const revenueLines = Array.from(revenueMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    const expenseLines = Array.from(expenseMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    const totalRevenue   = revenueLines.reduce((s, l) => s + l.halalas, 0);
    const totalExpense   = expenseLines.reduce((s, l) => s + l.halalas, 0);
    const costOfServices = expenseLines.find(l => l.code === '5000')?.halalas ?? 0;
    const grossProfit    = totalRevenue - costOfServices;
    const netProfit      = totalRevenue - totalExpense;
    const grossMargin    = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
    const netMargin      = totalRevenue > 0 ? Math.round((netProfit  / totalRevenue) * 100) : 0;
    return {
      revenueLines, expenseLines, totalRevenue, totalExpense,
      grossProfit, netProfit, grossMargin, netMargin,
      loading, year, quarter, setYear,
      setQuarter: setQuarter as (q: 0 | 1 | 2 | 3 | 4) => void,
      fromDate, toDate,
    };
  }, [revenueMap, expenseMap, loading, year, quarter, fromDate, toDate]);
}
