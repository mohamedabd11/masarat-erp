import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Shield } from 'lucide-react';

export default function InsurancePage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-rose-50 rounded-xl"><Shield size={22} className="text-rose-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التأمين' : 'Insurance'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة جميع حجوزات التأمين' : 'Manage all insurance bookings'}</p>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="insurance" />
    </div>
  );
}
