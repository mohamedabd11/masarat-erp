import { ChequesClient } from '@/components/cheques/ChequesClient';
import { UpgradeGate } from '@/components/ui/UpgradeGate';

export default function ChequesPage({ params }: { params: { locale: string } }) {
  return (
    <UpgradeGate feature="cheques">
      <ChequesClient locale={params.locale} />
    </UpgradeGate>
  );
}
