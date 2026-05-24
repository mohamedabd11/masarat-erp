export const dynamic = 'force-dynamic';

import { InvoiceDetailClient } from '@/components/invoices/InvoiceDetailClient';

export default function InvoiceDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  return <InvoiceDetailClient locale={params.locale} invoiceId={params.id} />;
}
