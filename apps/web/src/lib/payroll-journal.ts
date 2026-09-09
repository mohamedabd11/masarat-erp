import { GL, type GLAccount } from './gl-accounts';

export interface PayrollJournalInput {
  grossHalalas: number;
  employeeGosiHalalas: number;
  employerGosiHalalas: number;
  manualDeductionsHalalas: number;
  advanceDeductionHalalas: number;
}

export interface PayrollJournalLine {
  account: GLAccount;
  debitHalalas: number;
  creditHalalas: number;
}

export interface PayrollJournalResult {
  netHalalas: number;
  lines: PayrollJournalLine[];
  totalDebitHalalas: number;
  totalCreditHalalas: number;
}

export function buildPayrollJournal(input: PayrollJournalInput): PayrollJournalResult {
  for (const [name, amount] of Object.entries(input)) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`${name} must be a non-negative safe integer`);
    }
  }

  const netHalalas = input.grossHalalas
    - input.employeeGosiHalalas
    - input.manualDeductionsHalalas
    - input.advanceDeductionHalalas;
  if (netHalalas < 0) throw new Error('Payroll net amount cannot be negative');

  const lines: PayrollJournalLine[] = [
    { account: GL.salaryExpense, debitHalalas: input.grossHalalas, creditHalalas: 0 },
  ];
  if (input.employerGosiHalalas > 0) {
    lines.push({ account: GL.gosiExpense, debitHalalas: input.employerGosiHalalas, creditHalalas: 0 });
  }
  if (netHalalas > 0) {
    lines.push({ account: GL.salariesPayable, debitHalalas: 0, creditHalalas: netHalalas });
  }
  const totalGosi = input.employeeGosiHalalas + input.employerGosiHalalas;
  if (totalGosi > 0) {
    lines.push({ account: GL.gosiPayable, debitHalalas: 0, creditHalalas: totalGosi });
  }
  if (input.advanceDeductionHalalas > 0) {
    lines.push({ account: GL.employeeAdvances, debitHalalas: 0, creditHalalas: input.advanceDeductionHalalas });
  }
  if (input.manualDeductionsHalalas > 0) {
    lines.push({ account: GL.payrollDeductionsPayable, debitHalalas: 0, creditHalalas: input.manualDeductionsHalalas });
  }

  const totalDebitHalalas = lines.reduce((sum, line) => sum + line.debitHalalas, 0);
  const totalCreditHalalas = lines.reduce((sum, line) => sum + line.creditHalalas, 0);
  if (totalDebitHalalas !== totalCreditHalalas) {
    throw new Error('Payroll journal is not balanced');
  }

  return { netHalalas, lines, totalDebitHalalas, totalCreditHalalas };
}
