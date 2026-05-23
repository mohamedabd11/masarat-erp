import { ChequesClient } from '@/components/cheques/ChequesClient';

export default function ChequesPage({ params }: { params: { locale: string } }) {
  return <ChequesClient locale={params.locale} />;
}
