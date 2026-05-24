export const dynamic = 'force-dynamic';
import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Stamp, Globe, Clock, CheckCircle2 } from 'lucide-react';

export default function VisasPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-red-50 rounded-2xl border border-red-100">
          <Stamp size={24} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التأشيرات' : 'Visas'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'طلبات التأشيرة لجميع الدول — سياحي وزيارة عائلية وعمل' : 'Visa applications worldwide — tourist, family, and business'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: Globe,        label: isAr ? 'شينغن' : 'Schengen',    cls: 'bg-blue-50 text-blue-700' },
              { icon: Clock,        label: isAr ? 'بانتظار' : 'Pending',   cls: 'bg-amber-50 text-amber-700' },
              { icon: CheckCircle2, label: isAr ? 'صادرة' : 'Issued',      cls: 'bg-emerald-50 text-emerald-700' },
              { icon: Stamp,        label: isAr ? 'عاجل' : 'Express',      cls: 'bg-red-50 text-red-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="visa" />
    </div>
  );
}
