import { EmployeesClient } from '@/components/employees/EmployeesClient';
import { UpgradeGate } from '@/components/ui/UpgradeGate';

export default function EmployeesPage({ params }: { params: { locale: string } }) {
  return (
    <UpgradeGate feature="employees">
      <EmployeesClient locale={params.locale} />
    </UpgradeGate>
  );
}
