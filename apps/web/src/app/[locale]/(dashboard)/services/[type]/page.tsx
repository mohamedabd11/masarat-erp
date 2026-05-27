'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@masarat/firebase';
import { BookingsClient } from '@/components/bookings/BookingsClient';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api-client';
import type { BookingType } from '@/lib/schema';

interface ServiceTypeMeta {
  nameAr: string;
  nameEn: string;
}

export default function CustomServicePage({
  params,
}: {
  params: { locale: string; type: string };
}) {
  const { locale, type } = params;
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [meta, setMeta] = useState<ServiceTypeMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchMeta() {
      try {
        const data = await apiFetch<{ serviceType: ServiceTypeMeta }>(`/api/service-types/${type}`);
        setMeta(data.serviceType);
      } catch {
        setMeta({ nameAr: type, nameEn: type });
      } finally {
        setLoading(false);
      }
    }
    void fetchMeta();
  }, [user, type]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const title = isAr ? meta?.nameAr : meta?.nameEn;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr ? `إدارة طلبات ${title}` : `Manage ${title} orders`}
        </p>
      </div>
      <BookingsClient locale={locale} bookingType={type as BookingType} />
    </div>
  );
}
