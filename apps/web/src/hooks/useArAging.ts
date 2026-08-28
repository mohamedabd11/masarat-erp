'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';

export interface ArAgingCustomerRow {
  customerId: string | null;
  customerNameAr: string;
  customerNameEn: string | null;
  invoiceCount: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days91plus: number;
  totalOutstanding: number;
}

export interface ArAgingSummary {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days91plus: number;
  totalOutstanding: number;
}

export interface ArAgingReconciliation {
  agingTotalOutstanding: number;
  glReceivableBalance: number;
  difference: number;
  reconciled: boolean;
}

interface ArAgingResponse {
  asOf: string;
  detailSnapshotDate: string;
  historicalDetailAvailable: boolean;
  summary: ArAgingSummary;
  customers: ArAgingCustomerRow[];
  reconciliation: ArAgingReconciliation | null;
  error?: string;
}

const EMPTY_SUMMARY: ArAgingSummary = {
  current: 0,
  days1to30: 0,
  days31to60: 0,
  days61to90: 0,
  days91plus: 0,
  totalOutstanding: 0,
};

export function useArAging(asOf: string) {
  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;
  const [data, setData] = useState<ArAgingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!agencyId) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch<ArAgingResponse>(`/api/reports/aging?asOf=${asOf}`)
      .then((response) => {
        if (cancelled) return;
        if (response.error) throw new Error(response.error);
        setData(response);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(reason instanceof Error ? reason.message : 'تعذّر تحميل التقرير');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [agencyId, asOf, revision]);

  return {
    rows: data?.customers ?? [],
    summary: data?.summary ?? EMPTY_SUMMARY,
    reconciliation: data?.reconciliation ?? null,
    detailSnapshotDate: data?.detailSnapshotDate ?? null,
    historicalDetailAvailable: data?.historicalDetailAvailable ?? true,
    loading,
    error,
    reload,
  };
}
