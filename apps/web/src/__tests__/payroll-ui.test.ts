import { describe, expect, it } from 'vitest';
import {
  grossPayrollTotal,
  payrollCompensationForMonth,
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

  it('uses the effective contract salary and all recurring allowances for the selected month', () => {
    const compensation = payrollCompensationForMonth({
      employeeId: 'employee-1',
      employeeSalaryHalalas: 700_000,
      month: '2026-09',
      contracts: [
        {
          employeeId: 'employee-1', status: 'active', startDate: '2026-01-01', endDate: null,
          baseSalaryHalalas: 800_000, housingAllowanceHalalas: 200_000,
          transportAllowanceHalalas: 50_000, otherAllowancesHalalas: 25_000,
        },
      ],
    });

    expect(compensation).toEqual({
      baseSalaryHalalas: 800_000,
      recurringAllowancesHalalas: 275_000,
    });
    expect(grossPayrollTotal([{
      baseSalaryHalalas: compensation.baseSalaryHalalas,
      recurringAllowancesHalalas: compensation.recurringAllowancesHalalas,
      bonusHalalas: 30_000,
    }])).toBe(1_105_000);
  });

  it('falls back to the employee salary when no contract covers the month', () => {
    expect(payrollCompensationForMonth({
      employeeId: 'employee-1', employeeSalaryHalalas: 700_000, month: '2026-09',
      contracts: [{
        employeeId: 'employee-1', status: 'expired', startDate: '2025-01-01', endDate: '2025-12-31',
        baseSalaryHalalas: 900_000, housingAllowanceHalalas: 100_000,
        transportAllowanceHalalas: 0, otherAllowancesHalalas: 0,
      }],
    })).toEqual({ baseSalaryHalalas: 700_000, recurringAllowancesHalalas: 0 });
  });
});
