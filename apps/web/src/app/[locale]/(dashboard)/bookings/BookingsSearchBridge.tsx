'use client';

import { useSearchParams } from 'next/navigation';
import { BookingsClient } from '@/components/bookings/BookingsClient';

export function BookingsSearchBridge({ locale }: { locale: string }) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  return <BookingsClient locale={locale} initialQuery={initialQuery} />;
}
