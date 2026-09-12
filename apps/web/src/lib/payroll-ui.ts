export function upsertEmployeePayment<T extends { employeeId: string }>(
  payments: T[],
  nextPayment: T,
): T[] {
  const exists = payments.some(payment => payment.employeeId === nextPayment.employeeId);
  if (!exists) return [...payments, nextPayment];

  return payments.map(payment => (
    payment.employeeId === nextPayment.employeeId ? nextPayment : payment
  ));
}

export function totalPayrollDeductions(input: {
  manualHalalas: number;
  gosiEmployeeHalalas: number;
  advanceHalalas: number;
}): number {
  return input.manualHalalas + input.gosiEmployeeHalalas + input.advanceHalalas;
}

export function grossPayrollTotal(
  rows: Array<{ baseSalaryHalalas: number; recurringAllowancesHalalas?: number; bonusHalalas: number }>,
): number {
  return rows.reduce(
    (total, row) => total + row.baseSalaryHalalas + (row.recurringAllowancesHalalas ?? 0) + row.bonusHalalas,
    0,
  );
}

export interface PayrollContractSnapshot {
  employeeId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  baseSalaryHalalas: number;
  housingAllowanceHalalas: number;
  transportAllowanceHalalas: number;
  otherAllowancesHalalas: number;
}

export function payrollCompensationForMonth(input: {
  employeeId: string;
  employeeSalaryHalalas: number;
  month: string;
  contracts: readonly PayrollContractSnapshot[];
}): { baseSalaryHalalas: number; recurringAllowancesHalalas: number } {
  const [year, monthNumber] = input.month.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber! < 1 || monthNumber! > 12) {
    return { baseSalaryHalalas: input.employeeSalaryHalalas, recurringAllowancesHalalas: 0 };
  }
  const periodStart = `${input.month}-01`;
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const periodEnd = `${input.month}-${String(lastDay).padStart(2, '0')}`;
  const contract = input.contracts
    .filter(row => row.employeeId === input.employeeId
      && row.status === 'active'
      && row.startDate <= periodEnd
      && (!row.endDate || row.endDate >= periodStart))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!contract) return { baseSalaryHalalas: input.employeeSalaryHalalas, recurringAllowancesHalalas: 0 };
  return {
    baseSalaryHalalas: contract.baseSalaryHalalas,
    recurringAllowancesHalalas: contract.housingAllowanceHalalas
      + contract.transportAllowanceHalalas
      + contract.otherAllowancesHalalas,
  };
}
