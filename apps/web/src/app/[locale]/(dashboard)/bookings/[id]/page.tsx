import { BookingDetailClient } from '@/components/bookings/BookingDetailClient';

export default function BookingDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  return <BookingDetailClient locale={params.locale} bookingId={params.id} />;
}
