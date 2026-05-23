'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@masarat/firebase';
import type { BookingDoc, BookingStatus } from '@masarat/firebase';
import type { DocumentSnapshot } from 'firebase/firestore';

interface UseFirestoreBookingsOptions {
  status?: BookingStatus;
  pageSize?: number;
}

export interface BookingsState {
  bookings: BookingDoc[];
  loading: boolean;
  error: string | null;
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
  loadNextPage: () => Promise<void>;
  loadingMore: boolean;
}

export function useFirestoreBookings(options: UseFirestoreBookingsOptions = {}): BookingsState {
  const { user } = useAuth();
  const pageSize = options.pageSize ?? 50;

  const [bookings, setBookings] = useState<BookingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [extraPages, setExtraPages] = useState<BookingDoc[][]>([]);

  // First page — real-time via onSnapshot
  useEffect(() => {
    if (!user) {
      setBookings([]);
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    async function subscribe() {
      try {
        const { bookingsCol } = await import('@masarat/firebase');
        const { query, where, orderBy, limit, onSnapshot } = await import('firebase/firestore');

        const agencyId = (user as { agencyId?: string }).agencyId;
        if (!agencyId) {
          setLoading(false);
          setError('No agency ID in token');
          return;
        }

        const col = bookingsCol(agencyId);
        const constraints: Parameters<typeof query>[1][] = [
          where('agencyId', '==', agencyId),
          orderBy('createdAt', 'desc'),
          limit(pageSize),
        ];

        if (options.status) {
          constraints.push(where('status', '==', options.status));
        }

        const q = query(col, ...constraints);
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            const docs = snap.docs.map(d => d.data() as BookingDoc);
            setBookings(docs);
            setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
            setHasMore(snap.docs.length >= pageSize);
            setLoading(false);
            setError(null);
            // Reset extra pages when first page refreshes
            setExtraPages([]);
          },
          (err) => {
            setError(err.message);
            setLoading(false);
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to subscribe');
        setLoading(false);
      }
    }

    setLoading(true);
    void subscribe();
    return () => unsubscribe?.();
  }, [user, options.status, pageSize]);

  // Load next page via getDocs (one-time fetch, appended)
  const loadNextPage = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const { bookingsCol } = await import('@masarat/firebase');
      const { query, where, orderBy, limit, startAfter, getDocs } = await import('firebase/firestore');

      const agencyId = (user as { agencyId?: string } | null)?.agencyId;
      if (!agencyId) return;

      const col = bookingsCol(agencyId);
      const constraints: Parameters<typeof query>[1][] = [
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize),
      ];

      if (options.status) {
        constraints.push(where('status', '==', options.status));
      }

      const snap = await getDocs(query(col, ...constraints));
      const newDocs = snap.docs.map(d => d.data() as BookingDoc);

      if (newDocs.length > 0) {
        setExtraPages(prev => [...prev, newDocs]);
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length >= pageSize);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [lastDoc, loadingMore, hasMore, user, options.status, pageSize]);

  const allBookings = [...bookings, ...extraPages.flat()];

  return { bookings: allBookings, loading, error, lastDoc, hasMore, loadNextPage, loadingMore };
}
