'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@masarat/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgingBucket = 'current' | '31-60' | '61-90' | '90+';

export interface ArAgingRow {
  invoiceId:         string;
  invoiceNumber:     string;
  bookingId?:        string;
  bookingNumber?:    string;
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
  criticalCount:      number;  // 90+
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysDiff(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function toBucket(days: number): AgingBucket {
  if (days <= 30) return 'current';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useArAging() {
  const { user }   = useAuth();
  const agencyId   = (user?.agencyId as string | undefined) ?? null;
  const [rows,    setRows]    = useState<ArAgingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const { getFirestore, collection, query, where, getDocs } =
          await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        // All invoices for agency — filter amountDue > 0 client-side
        const snap = await getDocs(query(
          collection(db, 'invoices'),
          where('agencyId', '==', agencyId),
        ));

        if (cancelled) return;

        const result: ArAgingRow[] = [];

        for (const d of snap.docs) {
          const inv = d.data() as Record<string, unknown>;

          const amountDue = Number(inv['amountDue'] ?? 0);
          if (amountDue <= 0) continue;

          const buyer      = inv['buyer'] as { name?: { ar?: string; en?: string } } | undefined;
          const nameObj    = buyer?.name ?? {};
          const ts         = inv['issueDate'] as { toDate?: () => Date } | undefined;
          const issueDate  = ts?.toDate?.() ?? new Date();
          const days       = daysDiff(issueDate);

          result.push({
            invoiceId:         d.id,
            invoiceNumber:     String(inv['invoiceNumber'] ?? ''),
            bookingId:         (inv['bookingId'] as string | undefined) ?? undefined,
            bookingNumber:     (inv['bookingNumber'] as string | undefined) ?? undefined,
            customerNameAr:    nameObj['ar'] ?? (inv['customerNameAr'] as string | undefined) ?? '',
            customerNameEn:    nameObj['en'] ?? (inv['customerNameEn'] as string | undefined) ?? '',
            grandTotalHalalas: Number((inv['totals'] as Record<string, number> | undefined)?.['grandTotal'] ?? inv['amountDue'] as number + Number(inv['amountPaid'] ?? 0)),
            amountPaidHalalas: Number(inv['amountPaid'] ?? 0),
            amountDueHalalas:  amountDue,
            issueDate,
            daysOutstanding:   days,
            bucket:            toBucket(days),
          });
        }

        // Sort: oldest first (highest risk on top)
        result.sort((a, b) => b.daysOutstanding - a.daysOutstanding);
        setRows(result);
      } catch (err) {
        console.error('[useArAging]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
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
