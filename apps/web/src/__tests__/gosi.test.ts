import { describe, expect, it } from 'vitest';
import { calculateGosi, type GosiRate } from '@/lib/gosi';

const periods: GosiRate[] = [
  { scheme: 'legacy', effectiveFrom: '2022-01-01', pensionEmployeeRateBps: 900, pensionEmployerRateBps: 900, sanedEmployeeRateBps: 75, sanedEmployerRateBps: 75, occupationalEmployerRateBps: 200 },
  { scheme: 'new', effectiveFrom: '2024-07-03', pensionEmployeeRateBps: 900, pensionEmployerRateBps: 900, sanedEmployeeRateBps: 75, sanedEmployerRateBps: 75, occupationalEmployerRateBps: 200 },
  { scheme: 'new', effectiveFrom: '2025-07-01', pensionEmployeeRateBps: 950, pensionEmployerRateBps: 950, sanedEmployeeRateBps: 75, sanedEmployerRateBps: 75, occupationalEmployerRateBps: 200 },
  { scheme: 'new', effectiveFrom: '2026-07-01', pensionEmployeeRateBps: 1000, pensionEmployerRateBps: 1000, sanedEmployeeRateBps: 75, sanedEmployerRateBps: 75, occupationalEmployerRateBps: 200 },
  { scheme: 'expat', effectiveFrom: '2022-01-01', pensionEmployeeRateBps: 0, pensionEmployerRateBps: 0, sanedEmployeeRateBps: 0, sanedEmployerRateBps: 0, occupationalEmployerRateBps: 200 },
];

describe('effective-dated GOSI calculation', () => {
  it('uses legacy pension, SANED, and occupational-risk rates', () => {
    const result = calculateGosi({ contributoryWageHalalas: 1_000_000, scheme: 'legacy', asOfDate: '2026-09-30', sanedApplicable: true, periods });
    expect(result.employeeRateBps).toBe(975);
    expect(result.employerRateBps).toBe(1175);
    expect(result.employeeHalalas).toBe(97_500);
    expect(result.employerHalalas).toBe(117_500);
  });

  it('applies the new-system increase by its exact effective date', () => {
    expect(calculateGosi({ contributoryWageHalalas: 1_000_000, scheme: 'new', asOfDate: '2026-06-30', sanedApplicable: true, periods }).employeeRateBps).toBe(1025);
    expect(calculateGosi({ contributoryWageHalalas: 1_000_000, scheme: 'new', asOfDate: '2026-07-01', sanedApplicable: true, periods }).employeeRateBps).toBe(1075);
  });

  it('charges expatriates occupational risk to the employer only', () => {
    const result = calculateGosi({ contributoryWageHalalas: 800_000, scheme: 'expat', asOfDate: '2026-09-30', sanedApplicable: false, periods });
    expect(result.employeeHalalas).toBe(0);
    expect(result.employerHalalas).toBe(16_000);
  });

  it('caps the contributory wage at 45,000 SAR and can exclude SANED', () => {
    const result = calculateGosi({ contributoryWageHalalas: 8_000_000, scheme: 'legacy', asOfDate: '2026-09-30', sanedApplicable: false, periods });
    expect(result.contributoryWageHalalas).toBe(4_500_000);
    expect(result.employeeRateBps).toBe(900);
    expect(result.employerRateBps).toBe(1100);
  });

  it('requires a rate period covering the payroll date', () => {
    expect(() => calculateGosi({ contributoryWageHalalas: 100_000, scheme: 'new', asOfDate: '2024-07-02', sanedApplicable: true, periods })).toThrow(/rate period/i);
  });
});
