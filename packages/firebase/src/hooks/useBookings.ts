/**
 * @masarat/firebase — useBookings Hook
 * Real-time subscription للحجوزات مع Firestore onSnapshot
 */

import { useState, useEffect, useRef } from 'react';
import {
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { bookingsCol } from '../collections';
import type { BookingDoc, BookingStatus } from '../types';

export interface UseBookingsOptions {
  agencyId: string;
  status?: BookingStatus | BookingStatus[];
  agentId?: string;
  limitCount?: number;
  enabled?: boolean;
}

export interface UseBookingsReturn {
  bookings: BookingDoc[];
  loading: boolean;
  error: string | null;
}

/**
 * يستمع لتغييرات الحجوزات في الوقت الفعلي.
 * يُظهر التحديثات فور حدوثها في Firestore دون إعادة تحميل.
 */
export function useBookings(options: UseBookingsOptions): UseBookingsReturn {
  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);

  const { agencyId, status, agentId, limitCount = 50, enabled = true } = options;

  useEffect(() => {
    if (!enabled || !agencyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const constraints = [
      where('agencyId', '==', agencyId),
      orderBy('createdAt', 'desc'),
    ] as any[];

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      statuses.length === 1
        ? constraints.push(where('status', '==', statuses[0]))
        : constraints.push(where('status', 'in', statuses));
    }

    if (agentId) {
      constraints.push(where('agentId', '==', agentId));
    }

    constraints.push(limit(limitCount));

    const q = query(bookingsCol(), ...constraints);

    unsubRef.current = onSnapshot(
      q,
      (snap) => {
        setBookings(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubRef.current?.();
    };
  }, [agencyId, JSON.stringify(status), agentId, limitCount, enabled]);

  return { bookings, loading, error };
}

/** إحصائيات مباشرة للـ Dashboard */
export function usePendingApprovals(agencyId: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!agencyId) return;

    const q = query(
      bookingsCol(),
      where('agencyId', '==', agencyId),
      where('status', '==', 'pending_approval')
    );

    const unsub = onSnapshot(q, snap => setCount(snap.size));
    return () => unsub();
  }, [agencyId]);

  return count;
}
