import type { Metadata } from 'next';
import { PnrListClient } from '@/components/travel/PnrListClient';

export const metadata: Metadata = {
  title: 'إدارة PNR | مسارات ERP',
};

export default function PnrPage() {
  return <PnrListClient />;
}
