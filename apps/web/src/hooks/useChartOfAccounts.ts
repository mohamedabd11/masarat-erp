'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import type { ChartAccount } from '@/lib/schema';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountSide = 'debit' | 'credit';

// Re-export schema type aliased to the hook's legacy name
export type { ChartAccount };

export type NewAccountPayload = {
  code: string; nameAr: string; nameEn?: string; type: AccountType;
};
export type UpdateAccountPayload = Partial<NewAccountPayload>;

export interface UseChartOfAccountsReturn {
  accounts: ChartAccount[];
  loading: boolean;
  error: string | null;
  addAccount: (payload: NewAccountPayload) => Promise<void>;
  updateAccount: (id: string, payload: UpdateAccountPayload) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useChartOfAccounts(): UseChartOfAccountsReturn {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tick, setTick]         = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!user?.agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    apiFetch<{ accounts: ChartAccount[] }>('/api/accounting/coa')
      .then(d => { if (!cancelled) { setAccounts(d.accounts); setError(null); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.agencyId, tick]);

  const addAccount = useCallback(async (payload: NewAccountPayload) => {
    await apiFetch('/api/accounting/coa', { method: 'POST', body: JSON.stringify(payload) });
    refresh();
  }, [refresh]);

  const updateAccount = useCallback(async (id: string, payload: UpdateAccountPayload) => {
    await apiFetch(`/api/accounting/coa/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    refresh();
  }, [refresh]);

  const deleteAccount = useCallback(async (id: string) => {
    await apiFetch(`/api/accounting/coa/${id}`, { method: 'DELETE' });
    refresh();
  }, [refresh]);

  return { accounts, loading, error, addAccount, updateAccount, deleteAccount, refresh };
}
