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

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  flight:    { ar: 'طيران',        en: 'Flight' },
  hotel:     { ar: 'فندق',         en: 'Hotel' },
  package:   { ar: 'باقة سياحية',  en: 'Tour Package' },
  umrah:     { ar: 'عمرة',         en: 'Umrah' },
  hajj:      { ar: 'حج',           en: 'Hajj' },
  insurance: { ar: 'تأمين سفر',    en: 'Insurance' },
  visa:      { ar: 'تأشيرة',       en: 'Visa' },
  transport: { ar: 'نقل',          en: 'Transport' },
};

function getTypeLabel(type: string, isAr: boolean): string {
  const t = TYPE_LABELS[type];
  if (!t) return type;
  return isAr ? t.ar : t.en;
}

export function DashboardRecentBookings({ locale }: DashboardRecentBookingsProps) {
  const { bookings, loading, error } = useFirestoreBookings({ pageSize: 5 });
  const isAr = locale === 'ar';
  const loc2 = isAr ? 'ar-SA' : 'en-SA';

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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            <th className="text-start ps-6 pe-3 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
              {isAr ? 'رقم الحجز' : 'Ref #'}
            </th>
            <th className="text-start px-3 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {isAr ? 'العميل' : 'Customer'}
            </th>
            <th className="text-start px-3 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden sm:table-cell">
              {isAr ? 'النوع' : 'Type'}
            </th>
            <th className="text-start px-3 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 hidden md:table-cell">
              {isAr ? 'التاريخ' : 'Date'}
            </th>
            <th className="text-end px-3 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
              {isAr ? 'الإجمالي' : 'Total'}
            </th>
            <th className="text-start px-3 pe-6 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {isAr ? 'الحالة' : 'Status'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bookings.map((booking) => {
            const customerName = isAr ? booking.customerName.ar : booking.customerName.en;
            const createdDate  = booking.createdAt ? booking.createdAt.toDate() : new Date();

            return (
              <tr
                key={booking.id}
                className="hover:bg-slate-50 transition-colors duration-100"
              >
                {/* Ref # */}
                <td className="ps-6 pe-3 py-3.5">
                  <span className="font-mono text-xs font-semibold text-brand-700 whitespace-nowrap">
                    {booking.id}
                  </span>
                </td>

                {/* Customer */}
                <td className="px-3 py-3.5">
                  <p className="text-sm font-medium text-slate-900 truncate max-w-[160px]">
                    {customerName}
                  </p>
                </td>

                {/* Type */}
                <td className="px-3 py-3.5 hidden sm:table-cell">
                  <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {getTypeLabel(booking.type, isAr)}
                  </span>
                </td>

                {/* Date */}
                <td className="px-3 py-3.5 hidden md:table-cell">
                  <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDate(createdDate, loc2)}
                  </span>
                </td>

                {/* Total */}
                <td className="px-3 py-3.5 text-end">
                  <span className="text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    {formatCurrency(booking.grandTotalHalalas, loc2)}
                  </span>
                </td>

                {/* Status */}
                <td className="px-3 pe-6 py-3.5">
                  <BookingStatusBadge status={booking.status} locale={locale} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
