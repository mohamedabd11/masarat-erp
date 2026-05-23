import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Building2 } from 'lucide-react';

export default function HotelsPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-50 rounded-xl"><Building2 size={22} className="text-amber-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'حجوزات الفنادق' : 'Hotel Bookings'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة جميع حجوزات الفنادق' : 'Manage all hotel bookings'}</p>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="hotel" />
    </div>
  );
}
