'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';

export interface AppNotification {
  id:        string;
  type:      'overdue_invoice' | 'passport_expiry' | 'trial_expiry';
  severity:  'error' | 'warning' | 'info';
  titleAr:   string;
  titleEn:   string;
  descAr:    string;
  descEn:    string;
  link:      string;
}

export function useNotifications(locale: string) {
  const { user } = useAuth();
  const agencyId = (user?.agencyId as string | undefined) ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());

        const [invSnap, bkSnap] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('agencyId', '==', agencyId))),
          getDocs(query(collection(db, 'bookings'), where('agencyId', '==', agencyId))),
        ]);

        if (cancelled) return;

        const now      = Date.now();
        const in90days = now + 90 * 24 * 60 * 60 * 1000;
        const result: AppNotification[] = [];

        // ── Overdue invoices ─────────────────────────────────────────────────
        for (const doc of invSnap.docs) {
          const inv = doc.data() as Record<string, unknown>;
          if (inv['paymentStatus'] === 'fully_paid') continue;
          const dueTs = inv['dueDate'] as { toDate?: () => Date } | undefined;
          const due   = dueTs?.toDate?.()?.getTime();
          if (!due || due >= now) continue;

          const buyerName = ((inv['buyer'] as Record<string, unknown> | undefined)?.['name'] as Record<string, unknown> | undefined);
          const customer  = (buyerName?.['ar'] as string | undefined) ?? (buyerName?.['en'] as string | undefined) ?? '';
          const invNo     = (inv['invoiceNumber'] as string | undefined) ?? doc.id.slice(0, 8);
          const daysLate  = Math.floor((now - due) / 86_400_000);

          result.push({
            id:       `overdue-${doc.id}`,
            type:     'overdue_invoice',
            severity: 'error',
            titleAr:  `فاتورة متأخرة — ${invNo}`,
            titleEn:  `Overdue Invoice — ${invNo}`,
            descAr:   `${customer} · متأخرة ${daysLate} ${daysLate === 1 ? 'يوم' : 'أيام'}`,
            descEn:   `${customer} · ${daysLate} day${daysLate === 1 ? '' : 's'} overdue`,
            link:     `/${locale}/invoices/${doc.id}`,
          });
        }

        // ── Passports expiring within 90 days ────────────────────────────────
        for (const doc of bkSnap.docs) {
          const bk         = doc.data() as Record<string, unknown>;
          const status     = String(bk['status'] ?? '');
          if (status === 'cancelled' || status === 'completed') continue;

          const passengers = (bk['passengers'] as unknown[]) ?? [];
          const bkNo       = (bk['bookingNumber'] as string | undefined) ?? doc.id.slice(0, 8);

          for (const p of passengers) {
            const pax    = p as Record<string, unknown>;
            const expiry = pax['passportExpiry'] as string | undefined;
            if (!expiry) continue;
            const exp = new Date(expiry).getTime();
            if (isNaN(exp) || exp > in90days || exp < now) continue;

            const name      = (pax['nameAr'] as string | undefined) ?? (pax['nameEn'] as string | undefined) ?? '';
            const daysLeft  = Math.ceil((exp - now) / 86_400_000);
            const isExpired = exp < now;

            result.push({
              id:       `passport-${doc.id}-${pax['passportNumber'] as string ?? Math.random()}`,
              type:     'passport_expiry',
              severity: isExpired ? 'error' : 'warning',
              titleAr:  isExpired ? 'جواز سفر منتهي الصلاحية' : 'جواز سفر ينتهي قريباً',
              titleEn:  isExpired ? 'Passport Expired'        : 'Passport Expiring Soon',
              descAr:   `${name} · حجز ${bkNo}${isExpired ? ' (منتهي)' : ` · بعد ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`}`,
              descEn:   `${name} · Booking ${bkNo}${isExpired ? ' (expired)' : ` · in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
              link:     `/${locale}/bookings/${doc.id}`,
            });
          }
        }

        // Sort: errors first, then by type
        result.sort((a, b) => {
          if (a.severity === 'error' && b.severity !== 'error') return -1;
          if (b.severity === 'error' && a.severity !== 'error') return 1;
          return 0;
        });

        setNotifications(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId, locale]);

  return { notifications, loading, count: notifications.length };
}
