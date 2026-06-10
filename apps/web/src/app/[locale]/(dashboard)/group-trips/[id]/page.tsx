export const dynamic = 'force-dynamic';
import { GroupTripDetailClient } from '@/components/group-trips/GroupTripDetailClient';

export default function GroupTripDetailPage({ params }: { params: { locale: string; id: string } }) {
  return <GroupTripDetailClient locale={params.locale} tripId={params.id} />;
}
