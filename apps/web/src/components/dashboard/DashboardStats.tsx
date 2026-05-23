'use client';

import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { formatCurrency } from '@/lib/utils';
import { BookOpen, TrendingUp, FileText, DollarSign } from 'lucide-react';

interface DashboardStatsProps {
  locale: string;
}

export function DashboardStats({ locale }: DashboardStatsProps) {
  const { bookings, loading } = useFirestoreBookings();
  const isAr = locale === 'ar';

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-24 bg-slate-100 rounded-xl" />
        ))}
      </div>
    );
  }

  const totalBookings = bookings.length;
  const pendingBookings = bookings.filter((b) => b.status === 'pending_approval').length;
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.grandTotalHalalas ?? 0), 0);
  const pendingPayments = bookings.reduce((sum, b) => {
    const paid = b.paidHalalas ?? 0;
    const due = (b.grandTotalHalalas ?? 0) - paid;
    return sum + (due > 0 ? due : 0);
  }, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatsCard
        title={isAr ? 'إجمالي الحجوزات' : 'Total Bookings'}
        value={totalBookings.toLocaleString(isAr ? 'ar-SA' : 'en-US')}
        icon={BookOpen}
        iconBg="bg-brand-50"
        iconColor="text-brand-600"
      />
      <StatsCard
        title={isAr ? 'حجوزات بانتظار الموافقة' : 'Pending Bookings'}
        value={pendingBookings}
        icon={FileText}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        subtitle={isAr ? 'تحتاج مراجعة' : 'Need review'}
      />
      <StatsCard
        title={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
        value={formatCurrency(totalRevenue, isAr ? 'ar-SA' : 'en-SA')}
        icon={TrendingUp}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
      />
      <StatsCard
        title={isAr ? 'مدفوعات معلقة' : 'Pending Payments'}
        value={formatCurrency(pendingPayments, isAr ? 'ar-SA' : 'en-SA')}
        icon={DollarSign}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        subtitle={isAr ? 'مستحق التحصيل' : 'Due for collection'}
      />
    </div>
  );
}
