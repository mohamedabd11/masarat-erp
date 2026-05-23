'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFirestoreBookings } from '@/hooks/useFirestoreBookings';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BookOpen, Search } from 'lucide-react';

interface BookingsClientProps {
  locale: string;
}

function getBookingTypeLabel(type: string, isAr: boolean): string {
  const labels: Record<string, { ar: string; en: string }> = {
    umrah:      { ar: 'عمرة',          en: 'Umrah' },
    flight:     { ar: 'طيران',         en: 'Flight' },
    hotel:      { ar: 'فندق',          en: 'Hotel' },
    package:    { ar: 'باقة سياحية',   en: 'Tour Package' },
    visa:       { ar: 'تأشيرة',        en: 'Visa' },
    insurance:  { ar: 'تأمين',         en: 'Insurance' },
    transport:  { ar: 'نقل',           en: 'Transport' },
  };
  const entry = labels[type];
  if (!entry) return type;
  return isAr ? entry.ar : entry.en;
}

export function BookingsClient({ locale }: BookingsClientProps) {
  const { bookings, loading, error, hasMore, loadNextPage, loadingMore } =
    useFirestoreBookings({ pageSize: 50 });
  const [search, setSearch] = useState('');
  const isAr = locale === 'ar';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-600">
        {isAr ? 'حدث خطأ أثناء تحميل الحجوزات' : 'Error loading bookings'}: {error}
      </div>
    );
  }

  const searchLower = search.toLowerCase();
  const filtered = search
    ? bookings.filter((b) => {
        const customerName = isAr ? b.customerName.ar : b.customerName.en;
        return (
          b.id.toLowerCase().includes(searchLower) ||
          customerName.toLowerCase().includes(searchLower)
        );
      })
    : bookings;

  return (
    <>
      {/* Filters bar */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث عن حجز أو عميل...' : 'Search booking or customer...'}
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>
      </Card>

      {/* Bookings table or empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title={
            search
              ? (isAr ? 'لا توجد نتائج' : 'No results found')
              : (isAr ? 'لا توجد حجوزات بعد' : 'No bookings yet')
          }
          description={
            search
              ? (isAr ? 'جرب كلمة بحث مختلفة' : 'Try a different search term')
              : (isAr ? 'أنشئ حجزك الأول للبدء' : 'Create your first booking to get started')
          }
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  <th className="text-start ps-6 pe-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'رقم الحجز' : 'Booking #'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'العميل' : 'Customer'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'نوع الحجز' : 'Type'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {isAr ? 'تاريخ المغادرة' : 'Departure'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'الحالة' : 'Status'}
                  </th>
                  <th className="text-end px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                  <th className="text-end ps-4 pe-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'المستحق' : 'Due'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((booking) => {
                  const customerName = isAr ? booking.customerName.ar : booking.customerName.en;
                  const createdDate = booking.createdAt ? booking.createdAt.toDate() : new Date();
                  const departureDate = booking.travelDate ? booking.travelDate.toDate() : null;
                  const dueHalalas = booking.totalDue ?? 0;

                  return (
                    <tr
                      key={booking.id}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="ps-6 pe-4 py-4">
                        <Link
                          href={`/${locale}/bookings/${booking.id}`}
                          className="text-sm font-mono font-medium text-brand-700 hover:text-brand-800 hover:underline"
                        >
                          {booking.id}
                        </Link>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDate(createdDate, isAr ? 'ar-SA' : 'en-SA')}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-slate-900">{customerName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {booking.passengers?.length ?? 1}{' '}
                          {isAr ? 'مسافر' : 'traveler(s)'}
                        </p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <span className="text-sm text-slate-600">
                          {getBookingTypeLabel(booking.type, isAr)}
                        </span>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <span className="text-sm text-slate-600">
                          {departureDate
                            ? formatDate(departureDate, isAr ? 'ar-SA' : 'en-SA')
                            : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <BookingStatusBadge status={booking.status} locale={locale} />
                      </td>
                      <td className="px-4 py-4 text-end hidden sm:table-cell">
                        <span className="text-sm font-semibold text-slate-900">
                          {formatCurrency(booking.pricing?.totalAmount ?? 0, isAr ? 'ar-SA' : 'en-SA')}
                        </span>
                      </td>
                      <td className="ps-4 pe-6 py-4 text-end hidden sm:table-cell">
                        <span
                          className={`text-sm font-medium ${
                            dueHalalas > 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {dueHalalas > 0
                            ? formatCurrency(dueHalalas, isAr ? 'ar-SA' : 'en-SA')
                            : (isAr ? 'مكتمل' : 'Paid')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: row count + load more */}
          <div className="px-6 py-3 border-t border-surface-border flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {isAr
                ? `${filtered.length} حجز`
                : `${filtered.length} booking${filtered.length !== 1 ? 's' : ''}`}
            </span>
            {hasMore && !search && (
              <button
                onClick={loadNextPage}
                disabled={loadingMore}
                className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingMore ? (
                  <Spinner size="sm" />
                ) : null}
                {isAr ? 'تحميل المزيد' : 'Load More'}
              </button>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
