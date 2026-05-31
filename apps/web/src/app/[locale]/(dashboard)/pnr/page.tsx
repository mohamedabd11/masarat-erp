export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { PnrListClient } from '@/components/pnr/PnrListClient';

export default function PnrPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'سجلات PNR' : 'PNR Records'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr ? 'إدارة حجوزات GDS وربطها بالعملاء والحجوزات' : 'Manage GDS reservations and link them to customers and bookings'}
        </p>
      </div>

      <Suspense fallback={
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <PnrListClient locale={params.locale} />
      </Suspense>
    </div>
  );
}
