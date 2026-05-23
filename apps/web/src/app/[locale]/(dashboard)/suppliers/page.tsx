import { SuppliersClient } from '@/components/suppliers/SuppliersClient';

export default function SuppliersPage({ params }: { params: { locale: string } }) {
  return <SuppliersClient locale={params.locale} />;
}
