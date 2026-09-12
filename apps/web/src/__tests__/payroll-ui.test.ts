import { describe, expect, it } from 'vitest';
import {
  grossPayrollTotal,
  totalPayrollDeductions,
  upsertEmployeePayment,
} from '@/lib/payroll-ui';

describe('payroll UI payment state', () => {
  it('keeps adjustments for an employee before the first payslip exists', () => {
    const adjusted = upsertEmployeePayment([], {
      id: '',
      employeeId: 'employee-1',
      bonus: 50_000,
      deductions: 20_000,
    });

    expect(adjusted).toEqual([{
      id: '',
      employeeId: 'employee-1',
      bonus: 50_000,
      deductions: 20_000,
    }]);
  });

  it('replaces the virtual row when the payslip is created without duplicating it', () => {
    const adjusted = [{
      id: '',
      employeeId: 'employee-1',
      bonus: 50_000,
      deductions: 20_000,
    }];

    const materialized = upsertEmployeePayment(adjusted, {
      ...adjusted[0]!,
      id: 'payslip-1',
    });

    expect(materialized).toHaveLength(1);
    expect(materialized[0]).toMatchObject({
      id: 'payslip-1',
      employeeId: 'employee-1',
      bonus: 50_000,
      deductions: 20_000,
    });
  });

  it('shows all deductions returned by the created payslip immediately', () => {
    expect(totalPayrollDeductions({
      manualHalalas: 20_000,
      gosiEmployeeHalalas: 80_625,
      advanceHalalas: 60_000,
    })).toBe(160_625);
  });

  it('includes bonuses in the gross payroll summary', () => {
    expect(grossPayrollTotal([
      { baseSalaryHalalas: 800_000, bonusHalalas: 50_000 },
      { baseSalaryHalalas: 500_000, bonusHalalas: 0 },
    ])).toBe(1_350_000);
  });
});
