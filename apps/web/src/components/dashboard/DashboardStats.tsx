'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { formatCurrency, formatCount } from '@/lib/utils';
import { TrendingUp, CheckCircle2, Wallet, Receipt } from 'lucide-react';

interface DashboardStatsData {
  monthRevenue:    number;
  monthVat:        number;
  activeBookings:  number;
  pendingBookings: number;
  arOutstanding:   number;
}

export function DashboardStats({ locale }: { locale: string }) {
  const { user } = useAuth();
  const isAr     = locale === 'ar';
  const loc2     = isAr ? 'ar-SA' : 'en-SA';

  const [loading, setLoading] = useState(true);
  const [stats, setStats]     = useState<DashboardStatsData>({
    monthRevenue: 0, monthVat: 0, activeBookings: 0, pendingBookings: 0, arOutstanding: 0,
  });

  useEffect(() => {
    if (!user?.agencyId) { setLoading(false); return; }
    let cancelled = false;
    apiFetch<{ stats: DashboardStatsData }>('/api/dashboard/stats')
      .then(d => { if (!cancelled) setStats(d.stats); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.agencyId]);

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
        title={isAr ? 'مبيعات هذا الشهر' : "This Month's Sales"}
        value={formatCurrency(stats.monthRevenue, loc2)}
        icon={TrendingUp}
        iconBg="bg-brand-50"
        iconColor="text-brand-600"
        accentColor="border-brand-500"
        subtitle={isAr ? 'إجمالي فواتير العملاء قبل الضريبة' : 'Gross customer invoices excl. VAT'}
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
