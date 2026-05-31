'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@masarat/firebase';
import { planCanAccess, type FeatureKey } from '@/lib/plan-features';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trial' | 'active' | 'lifetime' | 'past_due' | 'cancelled' | 'loading';

interface FeatureOverride { featureKey: string; overrideType: string; }

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
  const { user, loading: authLoading } = useAuth();
  const [status,        setStatus]        = useState<SubscriptionStatus>('loading');
  const [plan,          setPlan]          = useState('');
  const [agencyName,    setAgencyName]    = useState('');
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const [overrides,     setOverrides]     = useState<FeatureOverride[]>([]);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  const load = useCallback(async (agencyId: string) => {
    setIsLoading(true);
    try {
      const { apiFetch } = await import('@/lib/api-client');

      const [settingsData, featuresData] = await Promise.allSettled([
        apiFetch<{ agency: { subscriptionStatus: string; plan: string; nameAr: string; nameEn?: string; trialEndDate?: string } }>('/api/settings'),
        apiFetch<{ overrides: FeatureOverride[] }>('/api/agencies/my-features'),
      ]);

      if (settingsData.status === 'fulfilled') {
        const { agency } = settingsData.value;
        const sub = (agency.subscriptionStatus ?? 'active') as SubscriptionStatus;
        setAgencyName(agency.nameAr ?? agency.nameEn ?? '');
        setPlan(agency.plan ?? '');

        const trialDaysLeft = agency.trialEndDate
          ? Math.ceil((new Date(agency.trialEndDate).getTime() - Date.now()) / 86_400_000)
          : null;
        const stillInTrial = trialDaysLeft !== null && trialDaysLeft > 0
          && sub !== 'cancelled' && sub !== 'past_due';
        setStatus(stillInTrial ? 'trial' : sub);
        setDaysRemaining(trialDaysLeft !== null ? Math.max(0, trialDaysLeft) : null);
      } else {
        // On error: default to trial access
        setStatus('trial');
        setPlan('trial');
        setDaysRemaining(null);
      }

      if (featuresData.status === 'fulfilled') {
        setOverrides(featuresData.value.overrides ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isSuperAdmin) { setStatus('active'); setPlan('super_admin'); setIsLoading(false); return; }

    const agencyId = user?.agencyId as string | undefined;
    if (!agencyId) { setIsLoading(false); return; }

    void load(agencyId);
  }, [user?.agencyId, isSuperAdmin, authLoading, load]);

  const isLifetime = status === 'lifetime';

  const isExpired = !isSuperAdmin && !isLifetime && (
    (status === 'trial'  && daysRemaining !== null && daysRemaining <= 0) ||
    status === 'past_due' ||
    status === 'cancelled'
  );

  // Build override maps for O(1) lookup
  const grantSet  = new Set(overrides.filter(o => o.overrideType === 'grant').map(o => o.featureKey));
  const revokeSet = new Set(overrides.filter(o => o.overrideType === 'revoke').map(o => o.featureKey));

  function canAccess(feature: FeatureKey): boolean {
    if (isLoading || isSuperAdmin) return true;

    // Per-agency overrides take precedence
    if (revokeSet.has(feature)) return false;
    if (grantSet.has(feature))  return true;

    // Fall back to plan-level check
    if (status === 'trial' || plan === 'trial' || plan === 'lifetime') return true;
    return planCanAccess(plan, feature);
  }

  return (
    <SubscriptionContext.Provider value={{ status, plan, agencyName, daysRemaining, isExpired, isLifetime, isLoading, canAccess }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
