export const dynamic = 'force-dynamic';
import { ReceiptVouchersClient } from '@/components/payments/ReceiptVouchersClient';
import { UpgradeGate } from '@/components/ui/UpgradeGate';

export default function ReceiptVouchersPage() {
  return (
    <UpgradeGate feature="receipt_vouchers">
      <ReceiptVouchersClient />
    </UpgradeGate>
  );
}
