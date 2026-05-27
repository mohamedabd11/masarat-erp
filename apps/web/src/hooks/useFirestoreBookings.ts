'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import type { Booking } from '@/lib/schema';

interface UseFirestoreBookingsOptions {
  status?: string;
  type?: string;
  pageSize?: number;
}

export interface BookingsState {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  lastDoc: null;
  hasMore: boolean;
  loadNextPage: () => Promise<void>;
  loadingMore: boolean;
  refresh: () => void;
}

export function useFirestoreBookings(options: UseFirestoreBookingsOptions = {}): BookingsState {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const refreshRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user?.agencyId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.type)   params.set('type',   options.type);

    apiFetch<{ bookings: Booking[] }>(`/api/bookings?${params}`)
      .then(data => {
        if (!cancelled) { setBookings(data.bookings); setError(null); }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.agencyId, options.status, options.type, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  return {
    bookings, loading, error,
    lastDoc: null, hasMore: false,
    loadNextPage: async () => {},
    loadingMore: false,
    refresh,
  };
}
