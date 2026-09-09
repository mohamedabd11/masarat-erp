import { describe, expect, it } from 'vitest';
import { buildPayrollJournal } from '@/lib/payroll-journal';

function amountForCode(result: ReturnType<typeof buildPayrollJournal>, code: string) {
  return result.lines.find((line) => line.account.code === code);
}

describe('payroll journal', () => {
  it('books the net salary and GOSI as separate liabilities', () => {
    const result = buildPayrollJournal({
      grossHalalas: 1_000_000,
      employeeGosiHalalas: 100_000,
      employerGosiHalalas: 120_000,
      manualDeductionsHalalas: 0,
      advanceDeductionHalalas: 0,
    });
    expect(result.netHalalas).toBe(900_000);
    expect(amountForCode(result, '2310')?.creditHalalas).toBe(900_000);
    expect(amountForCode(result, '2400')?.creditHalalas).toBe(220_000);
    expect(result.totalDebitHalalas).toBe(result.totalCreditHalalas);
  });

  it('clears employee advances instead of hiding them in salary payable', () => {
    const result = buildPayrollJournal({
      grossHalalas: 1_000_000,
      employeeGosiHalalas: 100_000,
      employerGosiHalalas: 120_000,
      manualDeductionsHalalas: 25_000,
      advanceDeductionHalalas: 75_000,
    });
    expect(result.netHalalas).toBe(800_000);
    expect(amountForCode(result, '2310')?.creditHalalas).toBe(800_000);
    expect(amountForCode(result, '1140')?.creditHalalas).toBe(75_000);
    expect(amountForCode(result, '2390')?.creditHalalas).toBe(25_000);
    expect(result.totalDebitHalalas).toBe(1_120_000);
    expect(result.totalCreditHalalas).toBe(1_120_000);
  });

  it('supports expat payroll with employer occupational-risk contribution only', () => {
    const result = buildPayrollJournal({
      grossHalalas: 500_000,
      employeeGosiHalalas: 0,
      employerGosiHalalas: 10_000,
      manualDeductionsHalalas: 0,
      advanceDeductionHalalas: 0,
    });
    expect(result.netHalalas).toBe(500_000);
    expect(amountForCode(result, '2400')?.creditHalalas).toBe(10_000);
    expect(result.totalDebitHalalas).toBe(result.totalCreditHalalas);
  });

  it('allows a zero net salary while keeping the journal balanced', () => {
    const result = buildPayrollJournal({
      grossHalalas: 100_000,
      employeeGosiHalalas: 10_000,
      employerGosiHalalas: 12_000,
      manualDeductionsHalalas: 90_000,
      advanceDeductionHalalas: 0,
    });
    expect(result.netHalalas).toBe(0);
    expect(amountForCode(result, '2310')).toBeUndefined();
    expect(result.totalDebitHalalas).toBe(result.totalCreditHalalas);
  });

  it('rejects negative net pay and unsafe monetary values', () => {
    expect(() => buildPayrollJournal({
      grossHalalas: 100,
      employeeGosiHalalas: 101,
      employerGosiHalalas: 0,
      manualDeductionsHalalas: 0,
      advanceDeductionHalalas: 0,
    })).toThrow(/negative/);
    expect(() => buildPayrollJournal({
      grossHalalas: Number.MAX_SAFE_INTEGER + 1,
      employeeGosiHalalas: 0,
      employerGosiHalalas: 0,
      manualDeductionsHalalas: 0,
      advanceDeductionHalalas: 0,
    })).toThrow(/safe integer/);
  });
});
