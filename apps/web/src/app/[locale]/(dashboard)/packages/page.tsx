export const dynamic = 'force-dynamic';
import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Package, Globe, Plane, Building2, Star } from 'lucide-react';

export default function PackagesPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100">
          <Package size={24} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الباقات السياحية' : 'Tour Packages'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'باقات شاملة تضم الطيران والفندق والجولات' : 'All-inclusive packages with flights, hotels, and tours'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: Plane,     label: isAr ? 'طيران + فندق' : 'Flight+Hotel', cls: 'bg-purple-50 text-purple-700' },
              { icon: Globe,     label: isAr ? 'دولي' : 'International',        cls: 'bg-sky-50 text-sky-700' },
              { icon: Building2, label: isAr ? 'شامل' : 'All Inclusive',        cls: 'bg-amber-50 text-amber-700' },
              { icon: Star,      label: isAr ? 'مميز' : 'Premium',              cls: 'bg-emerald-50 text-emerald-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BookingsClient locale={params.locale} bookingType="package" />
    </div>
  );
}
