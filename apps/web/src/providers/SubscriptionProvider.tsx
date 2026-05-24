'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@masarat/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'loading';

interface SubscriptionContextValue {
  status:        SubscriptionStatus;
  daysRemaining: number | null; // only meaningful when status === 'trial'
  isExpired:     boolean;
  isLoading:     boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status:        'loading',
  daysRemaining: null,
  isExpired:     false,
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
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    // مالك النظام لا يخضع لقيود الاشتراك
    if (isSuperAdmin) { setStatus('active'); setIsLoading(false); return; }

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

        if (sub === 'trial') {
          const trialEnd: Date | null = d.trialEndDate?.toDate?.() ?? null;
          if (trialEnd) {
            const days = Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000);
            setDaysRemaining(Math.max(0, days));
          } else {
            // لا يوجد trialEndDate ← نعطيه 14 يوماً افتراضياً (وكالات قديمة)
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

  const isExpired = !isSuperAdmin && (
    (status === 'trial'  && daysRemaining !== null && daysRemaining <= 0) ||
    status === 'past_due' ||
    status === 'cancelled'
  );

  return (
    <SubscriptionContext.Provider value={{ status, daysRemaining, isExpired, isLoading }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
