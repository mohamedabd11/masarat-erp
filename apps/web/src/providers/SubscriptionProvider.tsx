'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@masarat/firebase';
import { planCanAccess, type FeatureKey } from '@/lib/plan-features';

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
  canAccess:     (feature: FeatureKey) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status:        'loading',
  plan:          '',
  agencyName:    '',
  daysRemaining: null,
  isExpired:     false,
  isLifetime:    false,
  isLoading:     true,
  canAccess:     () => true,
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = process.env['NEXT_PUBLIC_SUPER_ADMIN_EMAIL'] ?? '';

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

    let cancelled = false;

    async function load() {
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const data = await apiFetch<{ agency: { subscriptionStatus: string; plan: string; nameAr: string; nameEn?: string; trialEndDate?: string } }>('/api/settings');
        if (cancelled) return;
        const { agency } = data;
        const sub = (agency.subscriptionStatus ?? 'active') as SubscriptionStatus;
        setStatus(sub);
        setPlan(agency.plan ?? '');
        setAgencyName(agency.nameAr ?? agency.nameEn ?? '');
        if (sub === 'trial' && agency.trialEndDate) {
          const days = Math.ceil((new Date(agency.trialEndDate).getTime() - Date.now()) / 86_400_000);
          setDaysRemaining(Math.max(0, days));
        } else {
          setDaysRemaining(null);
        }
      } catch {
        // On network / token errors: default to full trial access.
        // plan='trial' ensures canAccess() grants rank-10 (all features unlocked).
        if (!cancelled) { setStatus('trial'); setPlan('trial'); setDaysRemaining(null); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [user?.agencyId, isSuperAdmin]);

  const isLifetime = status === 'lifetime';

  const isExpired = !isSuperAdmin && !isLifetime && (
    (status === 'trial'  && daysRemaining !== null && daysRemaining <= 0) ||
    status === 'past_due' ||
    status === 'cancelled'
  );

  // Optimistic while loading; super-admin and trial always pass
  function canAccess(feature: FeatureKey): boolean {
    if (isLoading || isSuperAdmin) return true;
    if (status === 'trial' || plan === 'trial' || plan === 'lifetime') return true;
    return planCanAccess(plan, feature);
  }

  return (
    <SubscriptionContext.Provider value={{ status, plan, agencyName, daysRemaining, isExpired, isLifetime, isLoading, canAccess }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
