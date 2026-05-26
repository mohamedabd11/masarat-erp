'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  grossProfit:   number;  // revenue - cost of services only (5000)
  netProfit:     number;  // revenue - all expenses
  grossMargin:   number;  // %
  netMargin:     number;  // %
  loading:       boolean;
  year:          number;
  quarter:       0 | 1 | 2 | 3 | 4;  // 0 = full year
  setYear:       (y: number) => void;
  setQuarter:    (q: 0 | 1 | 2 | 3 | 4) => void;
  fromDate:      Date;
  toDate:        Date;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function quarterRange(year: number, quarter: 0 | 1 | 2 | 3 | 4): [Date, Date] {
  if (quarter === 0) return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
  const startMonth = (quarter - 1) * 3;
  return [new Date(year, startMonth, 1), new Date(year, startMonth + 3, 1)];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useIncomeStatement(): IncomeStatementData {
  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;

  const [year,    setYear]    = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [loading, setLoading] = useState(true);

  // Aggregated by accountCode: { nameAr, nameEn, type, halalas }
  const [revenueMap, setRevenueMap] = useState<Map<string, AccountLine>>(new Map());
  const [expenseMap, setExpenseMap] = useState<Map<string, AccountLine>>(new Map());

  const [fromDate, toDate] = useMemo(() => quarterRange(year, quarter), [year, quarter]);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const { getFirestore, collection, query, where, getDocs, Timestamp } =
          await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        const snap = await getDocs(query(
          collection(db, 'journal_entries'),
          where('agencyId', '==', agencyId),
          where('status',   '==', 'posted'),
          where('postedAt', '>=', Timestamp.fromDate(fromDate)),
          where('postedAt', '<',  Timestamp.fromDate(toDate)),
        ));

        if (cancelled) return;

        const rev = new Map<string, AccountLine>();
        const exp = new Map<string, AccountLine>();

        for (const d of snap.docs) {
          const entry = d.data() as Record<string, unknown>;
          const lines = (entry['lines'] as Record<string, unknown>[]) ?? [];

          for (const line of lines) {
            const code    = String(line['accountCode']    ?? '');
            const type    = String(line['accountType']    ?? '');
            const nameAr  = String(line['accountNameAr']  ?? code);
            const nameEn  = String(line['accountNameEn']  ?? code);
            const debit   = Number(line['debitHalalas']   ?? 0);
            const credit  = Number(line['creditHalalas']  ?? 0);

            if (type === 'revenue' && credit > 0) {
              const existing = rev.get(code);
              rev.set(code, { code, nameAr, nameEn, halalas: (existing?.halalas ?? 0) + credit });
            }
            if (type === 'expense' && debit > 0) {
              const existing = exp.get(code);
              exp.set(code, { code, nameAr, nameEn, halalas: (existing?.halalas ?? 0) + debit });
            }
          }
        }

        setRevenueMap(rev);
        setExpenseMap(exp);
      } catch (err) {
        console.error('[useIncomeStatement]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId, fromDate, toDate]);

  return useMemo(() => {
    const revenueLines = [...revenueMap.values()].sort((a, b) => a.code.localeCompare(b.code));
    const expenseLines = [...expenseMap.values()].sort((a, b) => a.code.localeCompare(b.code));

    const totalRevenue = revenueLines.reduce((s, l) => s + l.halalas, 0);
    const totalExpense = expenseLines.reduce((s, l) => s + l.halalas, 0);

    // Gross profit = revenue - cost of services (5000) only
    const costOfServices = expenseLines.find(l => l.code === '5000')?.halalas ?? 0;
    const grossProfit    = totalRevenue - costOfServices;
    const netProfit      = totalRevenue - totalExpense;
    const grossMargin    = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
    const netMargin      = totalRevenue > 0 ? Math.round((netProfit  / totalRevenue) * 100) : 0;

    return {
      revenueLines, expenseLines,
      totalRevenue, totalExpense,
      grossProfit, netProfit,
      grossMargin, netMargin,
      loading, year, quarter, setYear,
      setQuarter: setQuarter as (q: 0 | 1 | 2 | 3 | 4) => void,
      fromDate, toDate,
    };
  }, [revenueMap, expenseMap, loading, year, quarter, fromDate, toDate]);
}
