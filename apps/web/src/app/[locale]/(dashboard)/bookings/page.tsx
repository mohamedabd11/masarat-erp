import { getTranslations } from 'next-intl/server';
import { BookingsClient } from '@/components/bookings/BookingsClient';
import { NewBookingButton } from '@/components/bookings/NewBookingButton';

export default async function BookingsPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('bookings');
  const locale = params.locale;
  const isAr = locale === 'ar';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'جميع الحجوزات في النظام' : 'All bookings in the system'}
          </p>
        </div>
        <NewBookingButton label={t('newBooking')} />
      </div>

      {/* Search, filters, and table — client component with real Firestore data */}
      <BookingsClient locale={locale} />
    </div>
  );
}
