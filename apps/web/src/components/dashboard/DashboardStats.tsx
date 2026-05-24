'use client';

import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { formatCurrency, formatCount } from '@/lib/utils';
import { TrendingUp, CheckCircle2, Clock, Wallet } from 'lucide-react';

export function DashboardStats({ locale }: { locale: string }) {
  const { bookings, loading } = useFirestoreBookings();
  const isAr = locale === 'ar';
  const loc2 = isAr ? 'ar-SA' : 'en-SA';

  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-28 bg-slate-100 rounded-xl border-s-4 border-slate-200" />
        ))}
      </div>
    );
  }

  const active  = bookings.filter((b) => b.status === 'confirmed' || (b.status as string) === 'in_progress').length;
  const pending = bookings.filter((b) => b.status === 'pending_approval').length;
  const revenue = bookings.reduce((s, b) => s + ((b as any).grandTotalHalalas ?? b.pricing?.totalAmount ?? 0), 0);
  const due     = bookings.reduce((s, b) => {
    const total = (b as any).grandTotalHalalas ?? b.pricing?.totalAmount ?? 0;
    const paid  = (b as any).paidHalalas ?? b.totalPaid ?? 0;
    return s + Math.max(0, total - paid);
  }, 0);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <StatsCard
        title={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
        value={formatCurrency(revenue, loc2)}
        icon={TrendingUp}
        iconBg="bg-brand-50"
        iconColor="text-brand-600"
        accentColor="border-brand-500"
        subtitle={isAr ? 'من جميع الخدمات' : 'All services'}
      />
      <StatsCard
        title={isAr ? 'خدمات نشطة' : 'Active Services'}
        value={formatCount(active, loc2)}
        icon={CheckCircle2}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        accentColor="border-emerald-500"
        subtitle={isAr ? 'مؤكدة وجارية' : 'Confirmed & in progress'}
      />
      <StatsCard
        title={isAr ? 'بانتظار الموافقة' : 'Pending Approval'}
        value={formatCount(pending, loc2)}
        icon={Clock}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        accentColor="border-amber-500"
        subtitle={isAr ? 'تحتاج مراجعة' : 'Need review'}
      />
      <StatsCard
        title={isAr ? 'مستحق التحصيل' : 'Outstanding Balance'}
        value={formatCurrency(due, loc2)}
        icon={Wallet}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        accentColor="border-red-400"
        subtitle={isAr ? 'غير محصَّل' : 'Not yet collected'}
      />
    </div>
  );
}
