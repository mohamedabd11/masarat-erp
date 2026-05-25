'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@masarat/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trial' | 'active' | 'lifetime' | 'past_due' | 'cancelled' | 'loading';

interface SubscriptionContextValue {
  status:        SubscriptionStatus;
  plan:          string;
  agencyName:    string;
  daysRemaining: number | null;
  isExpired:     boolean;
  isLifetime:    boolean;
  isLoading:     boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status:        'loading',
  plan:          '',
  agencyName:    '',
  daysRemaining: null,
  isExpired:     false,
  isLifetime:    false,
  isLoading:     true,
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = 'mohamedabdalazim1111@gmail.com';

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status,        setStatus]        = useState<SubscriptionStatus>('loading');
  const [plan,          setPlan]          = useState('');
  const [agencyName,    setAgencyName]    = useState('');
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    if (isSuperAdmin) { setStatus('active'); setPlan('super_admin'); setIsLoading(false); return; }

    const agencyId = user?.agencyId as string | undefined;
    if (!agencyId) { setIsLoading(false); return; }

    let unsub: (() => void) | undefined;

    async function load() {
      const { getFirestore, doc, onSnapshot } = await import('firebase/firestore');
      const { getApp }                        = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      unsub = onSnapshot(doc(db, 'agencies', agencyId!), snap => {
        if (!snap.exists()) {
          setStatus('cancelled');
          setIsLoading(false);
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d   = snap.data() as Record<string, any>;
        const sub = (d.subscriptionStatus ?? 'active') as SubscriptionStatus;
        setStatus(sub);
        setPlan(d.plan ?? '');
        setAgencyName(d.nameAr ?? d.nameEn ?? '');

        if (sub === 'trial') {
          const trialEnd: Date | null = d.trialEndDate?.toDate?.() ?? null;
          if (trialEnd) {
            const days = Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000);
            setDaysRemaining(Math.max(0, days));
          } else {
            setDaysRemaining(14);
          }
        } else {
          setDaysRemaining(null);
        }

        setIsLoading(false);
      });
    }

    void load();
    return () => unsub?.();
  }, [user?.agencyId, isSuperAdmin]);

  const isLifetime = status === 'lifetime';

  const isExpired = !isSuperAdmin && !isLifetime && (
    (status === 'trial'  && daysRemaining !== null && daysRemaining <= 0) ||
    status === 'past_due' ||
    status === 'cancelled'
  );

  return (
    <SubscriptionContext.Provider value={{ status, plan, agencyName, daysRemaining, isExpired, isLifetime, isLoading }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
