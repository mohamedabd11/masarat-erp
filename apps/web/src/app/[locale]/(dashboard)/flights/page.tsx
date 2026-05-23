import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Plane } from 'lucide-react';

export default function FlightsPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-sky-50 rounded-xl"><Plane size={22} className="text-sky-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'حجوزات الطيران' : 'Flight Bookings'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة جميع حجوزات الطيران' : 'Manage all flight bookings'}</p>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="flight" />
    </div>
  );
}
