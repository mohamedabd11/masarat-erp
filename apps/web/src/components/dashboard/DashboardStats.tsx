'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { formatCurrency, formatCount } from '@/lib/utils';
import { TrendingUp, CheckCircle2, Clock, Wallet, Receipt } from 'lucide-react';

export function DashboardStats({ locale }: { locale: string }) {
  const { user } = useAuth();
  const isAr = locale === 'ar';
  const loc2 = isAr ? 'ar-SA' : 'en-SA';
  const agencyId = (user?.agencyId as string | undefined) ?? null;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    monthRevenue:   0,
    monthVat:       0,
    activeBookings: 0,
    pendingBookings: 0,
    arOutstanding:  0,
  });

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

        const now           = new Date();
        const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

        let monthRevenue = 0, monthVat = 0, arOutstanding = 0;
        for (const d of invSnap.docs) {
          const inv    = d.data() as Record<string, unknown>;
          const totals = inv.totals as Record<string, number> | undefined;
          const ts     = inv.createdAt as { toDate?: () => Date } | undefined;
          const date   = ts?.toDate?.() ?? new Date(0);

          if (date >= startOfMonth) {
            monthRevenue += Number(totals?.subtotalExclVat ?? 0);
            monthVat     += Number(totals?.totalVat        ?? 0);
          }

          arOutstanding += Math.max(0, Number(inv.amountDue ?? 0));
        }

        let activeBookings = 0, pendingBookings = 0;
        for (const d of bkSnap.docs) {
          const status = String((d.data() as Record<string, unknown>).status ?? '');
          if (status === 'confirmed' || status === 'ticketed') activeBookings++;
          if (status === 'pending_approval') pendingBookings++;
        }

        setStats({ monthRevenue, monthVat, activeBookings, pendingBookings, arOutstanding });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-28 bg-slate-100 rounded-xl border-s-4 border-slate-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <StatsCard
        title={isAr ? 'إيرادات هذا الشهر' : "This Month's Revenue"}
        value={formatCurrency(stats.monthRevenue, loc2)}
        icon={TrendingUp}
        iconBg="bg-brand-50"
        iconColor="text-brand-600"
        accentColor="border-brand-500"
        subtitle={isAr ? 'صافي من الضريبة' : 'Excl. VAT'}
      />
      <StatsCard
        title={isAr ? 'ضريبة القيمة المضافة' : 'VAT Collected'}
        value={formatCurrency(stats.monthVat, loc2)}
        icon={Receipt}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        accentColor="border-amber-500"
        subtitle={isAr ? 'هذا الشهر' : 'This month'}
      />
      <StatsCard
        title={isAr ? 'خدمات نشطة' : 'Active Services'}
        value={formatCount(stats.activeBookings, loc2)}
        icon={CheckCircle2}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        accentColor="border-emerald-500"
        subtitle={isAr ? 'مؤكدة وجارية' : 'Confirmed & in progress'}
      />
      <StatsCard
        title={isAr ? 'ذمم مدينة مستحقة' : 'Outstanding AR'}
        value={formatCurrency(stats.arOutstanding, loc2)}
        icon={Wallet}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        accentColor="border-red-400"
        subtitle={isAr ? 'غير محصَّل بعد' : 'Not yet collected'}
      />
    </div>
  );
}
