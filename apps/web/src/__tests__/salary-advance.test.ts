import { describe, expect, it } from 'vitest';
import { buildAdvanceInstallments } from '@/lib/salary-advance';

describe('salary advance installments', () => {
  it('spreads the advance into equal monthly installments and preserves every halala', () => {
    const rows = buildAdvanceInstallments({ amountHalalas: 100_001, firstMonth: '2026-09', installmentCount: 3, monthlyCapHalalas: 50_000 });
    expect(rows).toEqual([
      { installmentNumber: 1, dueMonth: '2026-09', amountHalalas: 33_334 },
      { installmentNumber: 2, dueMonth: '2026-10', amountHalalas: 33_334 },
      { installmentNumber: 3, dueMonth: '2026-11', amountHalalas: 33_333 },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountHalalas, 0)).toBe(100_001);
  });

  it('defaults to enough installments to respect the 10% wage cap', () => {
    const rows = buildAdvanceInstallments({ amountHalalas: 250_000, firstMonth: '2026-12', monthlyCapHalalas: 100_000 });
    expect(rows).toHaveLength(3);
    expect(Math.max(...rows.map((row) => row.amountHalalas))).toBeLessThanOrEqual(100_000);
    expect(rows.at(-1)?.dueMonth).toBe('2027-02');
  });

  it('rejects a requested schedule that exceeds the monthly statutory cap', () => {
    expect(() => buildAdvanceInstallments({ amountHalalas: 250_000, firstMonth: '2026-09', installmentCount: 2, monthlyCapHalalas: 100_000 })).toThrow(/installment count/i);
  });

  it('accounts for other advance deductions already committed in a month', () => {
    expect(() => buildAdvanceInstallments({
      amountHalalas: 100_000,
      firstMonth: '2026-09',
      installmentCount: 1,
      monthlyCapHalalas: 100_000,
      committedByMonth: new Map([['2026-09', 1]]),
    })).toThrow(/monthly cap/i);
  });
});
