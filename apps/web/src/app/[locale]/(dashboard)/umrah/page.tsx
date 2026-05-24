export const dynamic = 'force-dynamic';
import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Moon, Users, CalendarDays, Tent } from 'lucide-react';

export default function UmrahPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-brand-50 rounded-2xl border border-brand-100">
          <Moon size={24} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'العمرة والحج' : 'Umrah & Hajj'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'برامج العمرة والحج — فردي ومجموعات وحج نظامي' : 'Umrah & Hajj programs — individual, groups & systematic Hajj'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: Moon,         label: isAr ? 'عمرة رمضان' : 'Ramadan Umrah', cls: 'bg-brand-50 text-brand-700' },
              { icon: CalendarDays, label: isAr ? 'موسمي' : 'Seasonal',           cls: 'bg-amber-50 text-amber-700' },
              { icon: Users,        label: isAr ? 'مجموعات' : 'Groups',           cls: 'bg-purple-50 text-purple-700' },
              { icon: Tent,         label: isAr ? 'حج نظامي' : 'Hajj Program',   cls: 'bg-emerald-50 text-emerald-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="umrah" />
    </div>
  );
}
