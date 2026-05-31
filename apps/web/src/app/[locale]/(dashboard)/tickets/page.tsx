export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { TicketListClient } from '@/components/tickets/TicketListClient';

export default function TicketsPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'التذاكر' : 'Tickets'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr ? 'إدارة تذاكر الطيران الصادرة عبر GDS' : 'Manage issued GDS flight tickets'}
        </p>
      </div>

      <Suspense fallback={
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <TicketListClient locale={params.locale} />
      </Suspense>
    </div>
  );
}
