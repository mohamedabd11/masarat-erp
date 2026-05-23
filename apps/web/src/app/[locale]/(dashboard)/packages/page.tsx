import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Package } from 'lucide-react';

export default function PackagesPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-50 rounded-xl"><Package size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الباقات السياحية' : 'Tour Packages'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة جميع الباقات السياحية' : 'Manage all tour packages'}</p>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="package" />
    </div>
  );
}
