import { BookingsClient } from '@/components/bookings/BookingsClient';
import { CreditCard } from 'lucide-react';

export default function VisasPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-xl"><CreditCard size={22} className="text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التأشيرات' : 'Visas'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة جميع طلبات التأشيرة' : 'Manage all visa applications'}</p>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="visa" />
    </div>
  );
}
