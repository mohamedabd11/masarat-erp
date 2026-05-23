import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Moon } from 'lucide-react';

export default function UmrahPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-50 rounded-xl"><Moon size={22} className="text-green-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'العمرة والحج' : 'Umrah & Hajj'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة جميع حجوزات العمرة والحج' : 'Manage all Umrah & Hajj bookings'}</p>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="umrah" />
    </div>
  );
}
