'use client';

import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BookOpen } from 'lucide-react';

interface DashboardRecentBookingsProps {
  locale: string;
}

export function DashboardRecentBookings({ locale }: DashboardRecentBookingsProps) {
  const { bookings, loading, error } = useFirestoreBookings({ pageSize: 5 });
  const isAr = locale === 'ar';

  if (loading) {
    return <FullPageSpinner />;
  }

  if (error) {
    return (
      <div className="px-6 py-4 text-sm text-red-600">
        {isAr ? 'حدث خطأ أثناء تحميل الحجوزات' : 'Error loading bookings'}: {error}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={48} />}
        title={isAr ? 'لا توجد حجوزات بعد' : 'No bookings yet'}
        description={isAr ? 'ستظهر الحجوزات الأخيرة هنا' : 'Recent bookings will appear here'}
      />
    );
  }

  return (
    <div className="divide-y divide-surface-border">
      {bookings.map((booking) => {
        const customerName = isAr ? booking.customerNameAr : booking.customerNameEn;
        const createdDate = booking.createdAt ? booking.createdAt.toDate() : new Date();

        return (
          <div
            key={booking.id}
            className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{customerName}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {booking.id} · {booking.type}
              </p>
            </div>
            <div className="text-end flex-shrink-0">
              <p className="text-sm font-semibold text-slate-900">
                {formatCurrency(booking.grandTotalHalalas, isAr ? 'ar-SA' : 'en-SA')}
              </p>
              <p className="text-xs text-slate-400">
                {formatDate(createdDate, isAr ? 'ar-SA' : 'en-SA')}
              </p>
            </div>
            <BookingStatusBadge status={booking.status} locale={locale} />
          </div>
        );
      })}
    </div>
  );
}
