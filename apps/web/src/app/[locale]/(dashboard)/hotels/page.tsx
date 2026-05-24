import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Building2, MapPin, BedDouble, Star } from 'lucide-react';

export default function HotelsPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
          <Building2 size={24} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'حجوزات الفنادق' : 'Hotel Bookings'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'فنادق داخل المملكة وخارجها — نموذج أصيل ووسيط' : 'Hotels in KSA & worldwide — principal and agent model'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: MapPin,    label: isAr ? 'داخل المملكة' : 'Saudi Arabia', cls: 'bg-amber-50 text-amber-700' },
              { icon: Building2, label: isAr ? 'دولي' : 'International',        cls: 'bg-sky-50 text-sky-700' },
              { icon: BedDouble, label: isAr ? 'مجموعات' : 'Group Stays',       cls: 'bg-purple-50 text-purple-700' },
              { icon: Star,      label: isAr ? '5 نجوم' : '5-Star',             cls: 'bg-emerald-50 text-emerald-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="hotel" />
    </div>
  );
}
