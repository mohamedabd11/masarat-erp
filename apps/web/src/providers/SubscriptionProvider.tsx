'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@masarat/firebase';
import type { FeatureKey } from '@/lib/plan-features';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'lifetime'
  | 'suspended'
  | 'expired'
  | 'past_due'      // legacy alias → treated as expired
  | 'cancelled'     // legacy alias → treated as expired
  | 'loading';

interface FeatureOverride { featureKey: string; overrideType: string; }

interface SubscriptionContextValue {
  status:        SubscriptionStatus;
  plan:          string;
  agencyName:    string;
  maxUsers:      number;
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
  maxUsers:      5,
  daysRemaining: null,
  isExpired:     false,
  isLifetime:    false,
  isLoading:     true,
  canAccess:     () => true,
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// ─── Blocked statuses ─────────────────────────────────────────────────────────

const BLOCKED = new Set<SubscriptionStatus>(['expired', 'suspended', 'past_due', 'cancelled']);

// ─── Provider ─────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = process.env['NEXT_PUBLIC_SUPER_ADMIN_EMAIL'] ?? '';

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [status,        setStatus]        = useState<SubscriptionStatus>('loading');
  const [plan,          setPlan]          = useState('');
  const [agencyName,    setAgencyName]    = useState('');
  const [maxUsers,      setMaxUsers]      = useState(5);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const [revokedSet,    setRevokedSet]    = useState<Set<string>>(new Set());

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  const load = useCallback(async (agencyId: string) => {
    setIsLoading(true);
    try {
      const { apiFetch } = await import('@/lib/api-client');

      const [settingsData, featuresData] = await Promise.allSettled([
        apiFetch<{
          agency: {
            subscriptionStatus: string;
            plan: string;
            nameAr: string;
            nameEn?: string;
            trialEndDate?: string;
            maxUsers?: number;
          }
        }>('/api/settings'),
        apiFetch<{ overrides: FeatureOverride[] }>('/api/agencies/my-features'),
      ]);

      if (settingsData.status === 'fulfilled') {
        const { agency } = settingsData.value;
        setAgencyName(agency.nameAr ?? agency.nameEn ?? '');
        setPlan(agency.plan ?? '');
        setMaxUsers(agency.maxUsers ?? 5);

        const rawStatus = (agency.subscriptionStatus ?? 'trial') as SubscriptionStatus;

        // Compute trial days remaining
        const trialDaysLeft = agency.trialEndDate
          ? Math.ceil((new Date(agency.trialEndDate).getTime() - Date.now()) / 86_400_000)
          : null;

        // Resolve effective status
        let effective: SubscriptionStatus = rawStatus;
        if (rawStatus === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0) {
          effective = 'expired';
        } else if (rawStatus === 'trial' && trialDaysLeft !== null && trialDaysLeft > 0) {
          effective = 'trial';
        }

        setStatus(effective);
        setDaysRemaining(trialDaysLeft !== null ? Math.max(0, trialDaysLeft) : null);
      } else {
        // On error default to trial (fail open — avoids locking out on network issues)
        setStatus('trial');
      }

      if (featuresData.status === 'fulfilled') {
        const revoked = new Set(
          (featuresData.value.overrides ?? [])
            .filter(o => o.overrideType === 'revoke')
            .map(o => o.featureKey)
        );
        setRevokedSet(revoked);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isSuperAdmin) {
      setStatus('active'); setPlan('super_admin'); setIsLoading(false);
      return;
    }
    const agencyId = user?.agencyId as string | undefined;
    if (!agencyId) { setIsLoading(false); return; }
    void load(agencyId);
  }, [user?.agencyId, isSuperAdmin, authLoading, load]);

  const isLifetime = status === 'lifetime';
  const isExpired  = !isSuperAdmin && !isLifetime && BLOCKED.has(status);

  function canAccess(feature: FeatureKey): boolean {
    if (isLoading || isSuperAdmin) return true;
    if (isExpired) return false;
    // Admin-disabled feature for this agency
    if (revokedSet.has(feature)) return false;
    return true;
  }

  return (
    <SubscriptionContext.Provider value={{
      status, plan, agencyName, maxUsers, daysRemaining,
      isExpired, isLifetime, isLoading, canAccess,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
