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
  rows: Array<{ baseSalaryHalalas: number; bonusHalalas: number }>,
): number {
  return rows.reduce(
    (total, row) => total + row.baseSalaryHalalas + row.bonusHalalas,
    0,
  );
}
