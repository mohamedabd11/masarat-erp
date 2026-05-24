'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@masarat/firebase';
import type { BookingDoc, BookingStatus, BookingType } from '@masarat/firebase';
import type { DocumentSnapshot } from 'firebase/firestore';

interface UseFirestoreBookingsOptions {
  status?: BookingStatus;
  type?: BookingType;
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
        const { query, where, limit, onSnapshot } = await import('firebase/firestore');

        const agencyId = user?.agencyId;
        if (!agencyId) {
          setLoading(false);
          setError('No agency ID in token');
          return;
        }

        const col = bookingsCol();
        // Only filter by agencyId to avoid composite index requirement.
        // Additional filters (status, type) applied client-side after fetch.
        const constraints: Parameters<typeof query>[1][] = [
          where('agencyId', '==', agencyId),
          limit(pageSize * 3), // fetch more to account for client-side filtering
        ];

        const q = query(col, ...constraints);
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            let docs = snap.docs.map(d => ({ ...d.data(), id: d.id }) as BookingDoc);

            // Client-side filters
            if (options.status) {
              docs = docs.filter(d => d.status === options.status);
            }
            if (options.type) {
              docs = docs.filter(d => d.type === options.type);
            }

            // Sort by createdAt desc client-side
            docs.sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() ?? 0;
              const bTime = b.createdAt?.toMillis?.() ?? 0;
              return bTime - aTime;
            });

            setBookings(docs.slice(0, pageSize));
            setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
            setHasMore(snap.docs.length >= pageSize * 3);
            setLoading(false);
            setError(null);
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
  }, [user, options.status, options.type, pageSize]);

  const loadNextPage = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const { bookingsCol } = await import('@masarat/firebase');
      const { query, where, limit, startAfter, getDocs } = await import('firebase/firestore');

      const agencyId = user?.agencyId;
      if (!agencyId) return;

      const col = bookingsCol();
      const constraints: Parameters<typeof query>[1][] = [
        where('agencyId', '==', agencyId),
        startAfter(lastDoc),
        limit(pageSize),
      ];

      const snap = await getDocs(query(col, ...constraints));
      let newDocs = snap.docs.map(d => ({ ...d.data(), id: d.id }) as BookingDoc);

      if (options.status) newDocs = newDocs.filter(d => d.status === options.status);
      if (options.type)   newDocs = newDocs.filter(d => d.type === options.type);

      newDocs.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });

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
  }, [lastDoc, loadingMore, hasMore, user, options.status, options.type, pageSize]);

  const allBookings = [...bookings, ...extraPages.flat()];

  return { bookings: allBookings, loading, error, lastDoc, hasMore, loadNextPage, loadingMore };
}
