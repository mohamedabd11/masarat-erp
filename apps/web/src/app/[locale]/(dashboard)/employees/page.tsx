import { EmployeesClient } from '@/components/employees/EmployeesClient';

export default function EmployeesPage({ params }: { params: { locale: string } }) {
  return <EmployeesClient locale={params.locale} />;
}
