import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Shield, Globe, HeartPulse, Briefcase, Plane } from 'lucide-react';

export default function InsurancePage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100">
          <Shield size={24} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'تأمين السفر' : 'Travel Insurance'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'وثائق تأمين السفر للأفراد والمجموعات' : 'Travel insurance policies for individuals and groups'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: Globe,      label: isAr ? 'شامل' : 'Comprehensive',   cls: 'bg-rose-50 text-rose-700' },
              { icon: HeartPulse, label: isAr ? 'طبي' : 'Medical',           cls: 'bg-red-50 text-red-700' },
              { icon: Plane,      label: isAr ? 'تأخير رحلة' : 'Trip Delay', cls: 'bg-amber-50 text-amber-700' },
              { icon: Briefcase,  label: isAr ? 'أمتعة' : 'Baggage',         cls: 'bg-sky-50 text-sky-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="insurance" />
    </div>
  );
}
