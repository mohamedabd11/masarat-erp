export const dynamic = 'force-dynamic';
import { PaymentsClient } from '@/components/payments/PaymentsClient';

export default function PaymentsPage({ params }: { params: { locale: string } }) {
  return <PaymentsClient locale={params.locale} />;
}
