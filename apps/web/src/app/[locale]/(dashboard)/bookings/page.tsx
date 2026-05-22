import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, BookOpen, Search, Filter } from 'lucide-react';

// Demo data — production uses Firestore via useBookings() hook on client
const demoBookings = [
  {
    id: 'BK-2026-000248',
    customerName: 'أحمد محمد العمري',
    type: 'umrah',
    typeLabel: { ar: 'عمرة', en: 'Umrah' },
    status: 'confirmed' as const,
    totalHalalas: 850000,
    paidHalalas: 850000,
    dueHalalas: 0,
    departureDate: new Date('2026-06-10'),
    travelers: 2,
    createdAt: new Date('2026-05-20'),
  },
  {
    id: 'BK-2026-000247',
    customerName: 'فاطمة علي الزهراني',
    type: 'flight',
    typeLabel: { ar: 'طيران', en: 'Flight' },
    status: 'pending_approval' as const,
    totalHalalas: 220000,
    paidHalalas: 110000,
    dueHalalas: 110000,
    departureDate: new Date('2026-05-28'),
    travelers: 1,
    createdAt: new Date('2026-05-21'),
  },
  {
    id: 'BK-2026-000246',
    customerName: 'خالد إبراهيم السعد',
    type: 'hotel',
    typeLabel: { ar: 'فندق', en: 'Hotel' },
    status: 'confirmed' as const,
    totalHalalas: 450000,
    paidHalalas: 200000,
    dueHalalas: 250000,
    departureDate: new Date('2026-06-05'),
    travelers: 4,
    createdAt: new Date('2026-05-21'),
  },
  {
    id: 'BK-2026-000245',
    customerName: 'منى عبدالله القحطاني',
    type: 'package',
    typeLabel: { ar: 'باقة سياحية', en: 'Tour Package' },
    status: 'in_progress' as const,
    totalHalalas: 1200000,
    paidHalalas: 600000,
    dueHalalas: 600000,
    departureDate: new Date('2026-05-25'),
    travelers: 3,
    createdAt: new Date('2026-05-22'),
  },
  {
    id: 'BK-2026-000244',
    customerName: 'سعود محمد الغامدي',
    type: 'visa',
    typeLabel: { ar: 'تأشيرة', en: 'Visa' },
    status: 'draft' as const,
    totalHalalas: 75000,
    paidHalalas: 0,
    dueHalalas: 75000,
    departureDate: new Date('2026-06-15'),
    travelers: 1,
    createdAt: new Date('2026-05-22'),
  },
];

export default async function BookingsPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('bookings');
  const locale = params.locale;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {locale === 'ar'
              ? `${demoBookings.length} حجز في النظام`
              : `${demoBookings.length} bookings in system`}
          </p>
        </div>
        <Link href={`/${locale}/bookings/new`}>
          <Button>
            <Plus size={16} />
            {t('newBooking')}
          </Button>
        </Link>
      </div>

      {/* Filters bar */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white">
            <Filter size={15} />
            {locale === 'ar' ? 'تصفية' : 'Filter'}
          </button>
        </div>
      </Card>

      {/* Bookings table */}
      {demoBookings.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title={t('noBookings')}
          description={t('noBookingsDesc')}
          action={{
            label: t('newBooking'),
            onClick: () => {},
          }}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  <th className="text-start ps-6 pe-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('bookingNumber')}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('customer')}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {t('bookingType')}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {t('departureDate')}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('status')}
                  </th>
                  <th className="text-end px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {t('totalAmount')}
                  </th>
                  <th className="text-end ps-4 pe-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {t('amountDue')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {demoBookings.map((booking) => (
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
                        {formatDate(booking.createdAt, locale === 'ar' ? 'ar-SA' : 'en-SA')}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-slate-900">{booking.customerName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {booking.travelers} {locale === 'ar' ? 'مسافر' : 'traveler(s)'}
                      </p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-sm text-slate-600">
                        {locale === 'ar' ? booking.typeLabel.ar : booking.typeLabel.en}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-sm text-slate-600">
                        {formatDate(booking.departureDate, locale === 'ar' ? 'ar-SA' : 'en-SA')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <BookingStatusBadge status={booking.status} locale={locale} />
                    </td>
                    <td className="px-4 py-4 text-end hidden sm:table-cell">
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(booking.totalHalalas, locale === 'ar' ? 'ar-SA' : 'en-SA')}
                      </span>
                    </td>
                    <td className="ps-4 pe-6 py-4 text-end hidden sm:table-cell">
                      <span className={`text-sm font-medium ${booking.dueHalalas > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {booking.dueHalalas > 0
                          ? formatCurrency(booking.dueHalalas, locale === 'ar' ? 'ar-SA' : 'en-SA')
                          : (locale === 'ar' ? 'مكتمل' : 'Paid')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
