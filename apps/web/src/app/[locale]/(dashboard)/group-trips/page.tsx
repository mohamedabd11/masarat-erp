export const dynamic = 'force-dynamic';
import { GroupTripsClient } from '@/components/group-trips/GroupTripsClient';

export default function GroupTripsPage({ params }: { params: { locale: string } }) {
  return <GroupTripsClient locale={params.locale} />;
}
