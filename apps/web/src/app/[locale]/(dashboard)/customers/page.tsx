import { CustomersClient } from '@/components/customers/CustomersClient';

export default function CustomersPage({ params }: { params: { locale: string } }) {
  return <CustomersClient locale={params.locale} />;
}
