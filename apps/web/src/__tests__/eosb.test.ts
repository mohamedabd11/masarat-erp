import { describe, expect, it } from 'vitest';
import {
  calculateEosb,
  calculateResignationEosb,
  calculateTerminationSettlement,
  monthlyEosbAccrual,
  resignationEosbMultiplier,
  yearsOfService,
} from '@/lib/eosb';

describe('Saudi end-of-service benefit', () => {
  const wage = 1_000_000; // 10,000 SAR

  it('uses half a month for each of the first five years', () => {
    expect(calculateEosb(wage, '2020-01-01', '2021-01-01')).toBe(500_000);
    expect(calculateEosb(wage, '2020-01-01', '2025-01-01')).toBe(2_500_000);
  });

  it('uses one full month for service after five years', () => {
    expect(calculateEosb(wage, '2020-01-01', '2026-01-01')).toBe(3_500_000);
  });

  it('includes proportional partial years', () => {
    expect(calculateEosb(wage, '2020-01-01', '2022-07-01')).toBe(1_247_945);
  });

  it('handles leap-day employment anniversaries consistently', () => {
    expect(yearsOfService('2020-02-29', '2021-02-28')).toBe(1);
    expect(calculateEosb(wage, '2020-02-29', '2021-02-28')).toBe(500_000);
  });

  it('returns zero for invalid, future, or non-positive inputs', () => {
    expect(calculateEosb(wage, 'bad-date', '2026-01-01')).toBe(0);
    expect(calculateEosb(wage, '2027-01-01', '2026-01-01')).toBe(0);
    expect(calculateEosb(0, '2020-01-01', '2026-01-01')).toBe(0);
  });

  it('applies Article 85 resignation bands separately from the base benefit', () => {
    expect(resignationEosbMultiplier(1.99)).toBe(0);
    expect(resignationEosbMultiplier(2)).toBeCloseTo(1 / 3);
    expect(resignationEosbMultiplier(5)).toBeCloseTo(1 / 3);
    expect(resignationEosbMultiplier(7)).toBeCloseTo(2 / 3);
    expect(resignationEosbMultiplier(10)).toBe(1);
    expect(calculateResignationEosb(wage, '2020-01-01', '2022-01-01')).toBe(333_333);
  });

  it('monthly change reconciles with the change in cumulative benefit', () => {
    const current = calculateEosb(wage, '2020-01-01', '2026-06-30');
    const previous = calculateEosb(wage, '2020-01-01', '2026-05-30');
    expect(monthlyEosbAccrual(wage, '2020-01-01', '2026-06-30')).toBe(current - previous);
    expect(monthlyEosbAccrual(wage, '2020-01-01', '2025-03-31')).toBe(
      calculateEosb(wage, '2020-01-01', '2025-03-31')
      - calculateEosb(wage, '2020-01-01', '2025-02-28'),
    );
  });

  it('maps termination types to the statutory entitlement without mixing them into the base provision', () => {
    const resignation = calculateTerminationSettlement(wage, '2020-01-01', '2023-01-01', 'resignation');
    expect(resignation.baseBenefitHalalas).toBe(1_500_000);
    expect(resignation.entitlementRateBps).toBe(3333);
    expect(resignation.settlementHalalas).toBe(500_000);

    expect(calculateTerminationSettlement(wage, '2020-01-01', '2023-01-01', 'contract_end').settlementHalalas).toBe(1_500_000);
    expect(calculateTerminationSettlement(wage, '2020-01-01', '2023-01-01', 'article_80').settlementHalalas).toBe(0);
  });
});
