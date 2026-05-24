import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Plane, Globe, Users, TrendingUp } from 'lucide-react';

export default function FlightsPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-sky-50 rounded-2xl border border-sky-100">
          <Plane size={24} className="text-sky-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'حجوزات الطيران' : 'Flight Bookings'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'تذاكر الطيران الداخلية والدولية — نموذج أصيل ووسيط' : 'Domestic & international flights — principal and agent model'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: Globe,     label: isAr ? 'دولي' : 'Intl.',     cls: 'bg-sky-50 text-sky-700' },
              { icon: Plane,     label: isAr ? 'داخلي' : 'Domestic', cls: 'bg-indigo-50 text-indigo-700' },
              { icon: Users,     label: isAr ? 'مجموعات' : 'Groups', cls: 'bg-purple-50 text-purple-700' },
              { icon: TrendingUp,label: isAr ? 'موسمي' : 'Seasonal', cls: 'bg-emerald-50 text-emerald-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="flight" />
    </div>
  );
}
