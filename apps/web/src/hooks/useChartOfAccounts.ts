'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@masarat/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountSide = 'debit' | 'credit';

export interface ChartAccount {
  id: string;          // Firestore document ID
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  side: AccountSide;
  balanceHalalas: number;
  agencyId: string;
  createdAt: number;   // epoch ms
  updatedAt: number;
}

export type NewAccountPayload = Omit<ChartAccount, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>;
export type UpdateAccountPayload = Partial<Omit<ChartAccount, 'id' | 'agencyId' | 'createdAt'>>;

// ─── Default accounts ─────────────────────────────────────────────────────────

const DEFAULT_ACCOUNTS: Omit<ChartAccount, 'id' | 'agencyId' | 'createdAt' | 'updatedAt'>[] = [
  // Assets
  { code: '1100', nameAr: 'النقدية',                     nameEn: 'Cash',                         type: 'asset',     side: 'debit',  balanceHalalas: 0 },
  { code: '1110', nameAr: 'البنك',                       nameEn: 'Bank',                         type: 'asset',     side: 'debit',  balanceHalalas: 0 },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',          nameEn: 'Accounts Receivable',          type: 'asset',     side: 'debit',  balanceHalalas: 0 },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',   nameEn: 'Prepaid Expenses',             type: 'asset',     side: 'debit',  balanceHalalas: 0 },
  // Liabilities
  { code: '2000', nameAr: 'ذمم دائنة - موردون',         nameEn: 'Accounts Payable - Suppliers', type: 'liability', side: 'credit', balanceHalalas: 0 },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',  nameEn: 'Accounts Payable Airlines',    type: 'liability', side: 'credit', balanceHalalas: 0 },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',          nameEn: 'Accounts Payable Hotels',      type: 'liability', side: 'credit', balanceHalalas: 0 },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة',nameEn: 'VAT Payable',                  type: 'liability', side: 'credit', balanceHalalas: 0 },
  { code: '2300', nameAr: 'ودائع العملاء',               nameEn: 'Customer Deposits',            type: 'liability', side: 'credit', balanceHalalas: 0 },
  // Equity
  { code: '3100', nameAr: 'رأس مال المالك',              nameEn: 'Owner Capital',                type: 'equity',    side: 'credit', balanceHalalas: 0 },
  { code: '3200', nameAr: 'الأرباح المحتجزة',            nameEn: 'Retained Earnings',            type: 'equity',    side: 'credit', balanceHalalas: 0 },
  // Revenue
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',         nameEn: 'Revenue - Agency Fees',        type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  { code: '4100', nameAr: 'إيراد خدمات السفر',          nameEn: 'Revenue - Travel Services',    type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',   nameEn: 'Tour Package Revenue',         type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  { code: '4120', nameAr: 'إيرادات الفنادق',            nameEn: 'Hotel Revenue',                type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  { code: '4130', nameAr: 'إيرادات العمرة',             nameEn: 'Umrah Revenue',                type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  { code: '4140', nameAr: 'إيرادات التأشيرات',          nameEn: 'Visa Revenue',                 type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  { code: '4150', nameAr: 'إيرادات التأمين',            nameEn: 'Insurance Revenue',            type: 'revenue',   side: 'credit', balanceHalalas: 0 },
  // Expenses
  { code: '5000', nameAr: 'تكلفة الخدمات',              nameEn: 'Cost of Services',             type: 'expense',   side: 'debit',  balanceHalalas: 0 },
  { code: '5100', nameAr: 'الرواتب والأجور',            nameEn: 'Salaries',                     type: 'expense',   side: 'debit',  balanceHalalas: 0 },
  { code: '5200', nameAr: 'الإيجار',                    nameEn: 'Rent',                         type: 'expense',   side: 'debit',  balanceHalalas: 0 },
  { code: '5300', nameAr: 'التسويق والإعلان',           nameEn: 'Marketing',                    type: 'expense',   side: 'debit',  balanceHalalas: 0 },
  { code: '5400', nameAr: 'المصاريف التشغيلية',         nameEn: 'Operating Expenses',           type: 'expense',   side: 'debit',  balanceHalalas: 0 },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseChartOfAccountsReturn {
  accounts: ChartAccount[];
  loading: boolean;
  error: string | null;
  addAccount: (payload: NewAccountPayload) => Promise<void>;
  updateAccount: (id: string, payload: UpdateAccountPayload) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
}

export function useChartOfAccounts(): UseChartOfAccountsReturn {
  const { user } = useAuth();

  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Real-time subscription + auto-seed on empty collection ────────────────
  useEffect(() => {
    if (!user) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    const agencyId: string = user.agencyId as string;
    if (!agencyId) {
      setError('No agencyId on user');
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let seeded = false;

    async function subscribe() {
      try {
        const { getApp } = await import('@masarat/firebase');
        const { getFirestore, collection, query, where, onSnapshot, writeBatch, doc } =
          await import('firebase/firestore');

        const db = getFirestore(getApp());
        const col = collection(db, 'chart_of_accounts');
        const q = query(col, where('agencyId', '==', agencyId));

        unsubscribe = onSnapshot(
          q,
          async (snap) => {
            // Auto-seed on first empty load using fixed IDs: ${agencyId}_${code}
            if (snap.empty && !seeded) {
              seeded = true;
              try {
                const batch = writeBatch(db);
                const now = Date.now();
                for (const acct of DEFAULT_ACCOUNTS) {
                  const ref = doc(col, `${agencyId}_${acct.code}`);
                  batch.set(ref, {
                    ...acct,
                    agencyId,
                    createdAt: now,
                    updatedAt: now,
                  });
                }
                await batch.commit();
                // onSnapshot will fire again with the seeded data
              } catch (seedErr) {
                setError(seedErr instanceof Error ? seedErr.message : 'Failed to seed accounts');
                setLoading(false);
              }
              return;
            }

            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChartAccount));
            // Sort by code
            docs.sort((a, b) => a.code.localeCompare(b.code));
            setAccounts(docs);
            setLoading(false);
            setError(null);
          },
          (err) => {
            setError(err.message);
            setLoading(false);
          },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Subscription failed');
        setLoading(false);
      }
    }

    setLoading(true);
    void subscribe();
    return () => unsubscribe?.();
  }, [user]);

  // ── addAccount ─────────────────────────────────────────────────────────────
  const addAccount = useCallback(
    async (payload: NewAccountPayload) => {
      const agencyId: string = (user?.agencyId as string) ?? '';
      if (!agencyId) throw new Error('Not authenticated');

      const { getApp } = await import('@masarat/firebase');
      const { getFirestore, collection, doc, setDoc } = await import('firebase/firestore');

      const db = getFirestore(getApp());
      const col = collection(db, 'chart_of_accounts');
      const now = Date.now();

      await setDoc(doc(col, `${agencyId}_${payload.code.trim()}`), {
        ...payload,
        agencyId,
        createdAt: now,
        updatedAt: now,
      });
    },
    [user],
  );

  // ── updateAccount ──────────────────────────────────────────────────────────
  const updateAccount = useCallback(
    async (id: string, payload: UpdateAccountPayload) => {
      const { getApp } = await import('@masarat/firebase');
      const { getFirestore, collection, doc, updateDoc } = await import('firebase/firestore');

      const db = getFirestore(getApp());
      const ref = doc(collection(db, 'chart_of_accounts'), id);

      await updateDoc(ref, {
        ...payload,
        updatedAt: Date.now(),
      });
    },
    [],
  );

  // ── deleteAccount ──────────────────────────────────────────────────────────
  const deleteAccount = useCallback(async (id: string) => {
    const { getApp } = await import('@masarat/firebase');
    const { getFirestore, collection, doc, deleteDoc } = await import('firebase/firestore');

    const db = getFirestore(getApp());
    const ref = doc(collection(db, 'chart_of_accounts'), id);

    await deleteDoc(ref);
  }, []);

  return { accounts, loading, error, addAccount, updateAccount, deleteAccount };
}
