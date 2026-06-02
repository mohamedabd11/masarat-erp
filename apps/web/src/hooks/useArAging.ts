'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import type { Invoice } from '@/lib/schema';

export type AgingBucket = 'current' | '31-60' | '61-90' | '90+';

export interface ArAgingRow {
  invoiceId:         string;
  invoiceNumber:     string;
  bookingId?:        string;
  customerNameAr:    string;
  customerNameEn:    string;
  grandTotalHalalas: number;
  amountPaidHalalas: number;
  amountDueHalalas:  number;
  issueDate:         Date;
  daysOutstanding:   number;
  bucket:            AgingBucket;
}

export interface ArAgingSummary {
  totalDueHalalas:    number;
  currentHalalas:     number;
  days31to60Halalas:  number;
  days61to90Halalas:  number;
  days90plusHalalas:  number;
  invoiceCount:       number;
  criticalCount:      number;
}

function daysDiff(from: Date): number {
  return Math.floor((Date.now() - from.getTime()) / 86_400_000);
}

function toBucket(days: number): AgingBucket {
  if (days <= 30) return 'current';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function useArAging() {
  const { user }   = useAuth();
  const agencyId   = (user?.agencyId as string | undefined) ?? null;
  const [rows,    setRows]    = useState<ArAgingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    apiFetch<{ invoices: Invoice[] }>('/api/invoices')
      .then(data => {
        if (cancelled) return;
        const result: ArAgingRow[] = [];
        for (const inv of data.invoices) {
          // Credit notes (creditedHalalas) reduce the receivable without cash.
          const due = inv.totalHalalas - inv.paidHalalas - inv.creditedHalalas;
          if (due <= 0) continue;
          if (inv.status === 'cancelled' || inv.status === 'refunded') continue;
          const issueDate = new Date(inv.issueDate);
          const days      = daysDiff(issueDate);
          result.push({
            invoiceId:         inv.id,
            invoiceNumber:     inv.invoiceNumber,
            bookingId:         inv.bookingId ?? undefined,
            customerNameAr:    inv.buyerNameAr ?? '',
            customerNameEn:    inv.buyerNameEn ?? '',
            grandTotalHalalas: inv.totalHalalas,
            amountPaidHalalas: inv.paidHalalas,
            amountDueHalalas:  due,
            issueDate,
            daysOutstanding:   days,
            bucket:            toBucket(days),
          });
        }
        result.sort((a, b) => b.daysOutstanding - a.daysOutstanding);
        setRows(result);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId]);

  const summary: ArAgingSummary = useMemo(() => {
    const s: ArAgingSummary = {
      totalDueHalalas: 0, currentHalalas: 0,
      days31to60Halalas: 0, days61to90Halalas: 0, days90plusHalalas: 0,
      invoiceCount: rows.length, criticalCount: 0,
    };
    for (const r of rows) {
      s.totalDueHalalas += r.amountDueHalalas;
      if (r.bucket === 'current')  s.currentHalalas    += r.amountDueHalalas;
      if (r.bucket === '31-60')    s.days31to60Halalas += r.amountDueHalalas;
      if (r.bucket === '61-90')    s.days61to90Halalas += r.amountDueHalalas;
      if (r.bucket === '90+') {
        s.days90plusHalalas += r.amountDueHalalas;
        s.criticalCount++;
      }
    }
    return s;
  }, [rows]);

  return { rows, summary, loading };
}
