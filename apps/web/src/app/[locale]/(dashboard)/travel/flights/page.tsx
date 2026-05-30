export const dynamic = 'force-dynamic';

import { TravelFlightsClient } from '@/components/travel/TravelFlightsClient';

export default function TravelFlightsPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'البحث المباشر GDS' : 'GDS Live Search'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr
            ? 'ابحث عن رحلات مباشرةً من نظام توزيع المحتوى وأنشئ حجزاً في ثوانٍ'
            : 'Search flights directly from the GDS and create a PNR in seconds'
          }
        </p>
      </div>

      <TravelFlightsClient />
    </div>
  );
}
