'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import type { AppNotification } from '@/app/api/notifications/route';

export type { AppNotification };

export function useNotifications(locale: string) {
  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    apiFetch<{ notifications: AppNotification[] }>(`/api/notifications?locale=${locale}`)
      .then(d => { if (!cancelled) setNotifications(d.notifications); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agencyId, locale]);

  return { notifications, loading, count: notifications.length };
}
