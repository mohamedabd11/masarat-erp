'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import type { BookingDoc, BookingStatus } from '@masarat/firebase';

interface UseFirestoreBookingsOptions {
  status?: BookingStatus;
  pageSize?: number;
}

interface BookingsState {
  bookings: BookingDoc[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook لجلب بيانات الحجوزات من Firestore مع تحديث فوري (real-time).
 * يستخدم useBookings من @masarat/firebase مع الـ agencyId من JWT claims.
 *
 * في بيئة التطوير مع الـ Emulator، يتصل تلقائياً بالـ Emulator.
 */
export function useFirestoreBookings(options: UseFirestoreBookingsOptions = {}): BookingsState {
  const { user } = useAuth();
  const [state, setState] = useState<BookingsState>({
    bookings: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ bookings: [], loading: false, error: null });
      return;
    }

    // Dynamic import to avoid SSR issues
    let unsubscribe: (() => void) | undefined;

    async function subscribe() {
      try {
        const { bookingsCol } = await import('@masarat/firebase');
        const { query, where, orderBy, limit, onSnapshot } = await import('firebase/firestore');

        const agencyId = (user as { agencyId?: string }).agencyId;
        if (!agencyId) {
          setState({ bookings: [], loading: false, error: 'No agency ID in token' });
          return;
        }

        const col = bookingsCol(agencyId);
        const constraints: Parameters<typeof query>[1][] = [
          where('agencyId', '==', agencyId),
          orderBy('createdAt', 'desc'),
          limit(options.pageSize ?? 50),
        ];

        if (options.status) {
          constraints.push(where('status', '==', options.status));
        }

        const q = query(col, ...constraints);
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            setState({
              bookings: snap.docs.map(d => d.data() as BookingDoc),
              loading: false,
              error: null,
            });
          },
          (err) => {
            setState(prev => ({ ...prev, loading: false, error: err.message }));
          }
        );
      } catch (err) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to subscribe',
        }));
      }
    }

    setState(prev => ({ ...prev, loading: true }));
    void subscribe();

    return () => unsubscribe?.();
  }, [user, options.status, options.pageSize]);

  return state;
}
