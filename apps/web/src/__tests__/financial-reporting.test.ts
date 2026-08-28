import { describe, expect, it } from 'vitest';
import { isStrictIsoDate, validateReportRange } from '@/lib/report-dates';
import { calculateVatControlMovements } from '@/lib/vat-control';
import { allocateProRata, allocateSupplierBalanceByAge } from '@/lib/supplier-aging';

describe('report date validation', () => {
  it('accepts real ISO calendar dates and rejects normalized/partial dates', () => {
    expect(isStrictIsoDate('2026-02-28')).toBe(true);
    expect(isStrictIsoDate('2028-02-29')).toBe(true);
    expect(isStrictIsoDate('2026-02-29')).toBe(false);
    expect(isStrictIsoDate('2026-13-01')).toBe(false);
    expect(isStrictIsoDate('2026-1-01')).toBe(false);
  });

  it('rejects an inverted report range', () => {
    expect(validateReportRange('2026-04-01', '2026-03-31')).toEqual({
      valid: false,
      error: 'تاريخ البداية يجب ألا يكون بعد تاريخ النهاية',
    });
  });
});

describe('VAT control-account movements', () => {
  it('nets credit reversals against input VAT debits', () => {
    expect(calculateVatControlMovements({
      outputDebit: 1_500,
      outputCredit: 11_500,
      inputDebit: 4_000,
      inputCredit: 1_000,
    })).toEqual({ outputVat: 10_000, inputVat: 3_000, netVatPayable: 7_000 });
  });
});

describe('supplier aging allocation', () => {
  it('ages the remaining FIFO balance from obligation dates, not payment dates', () => {
    const result = allocateSupplierBalanceByAge(60_000, [
      { date: '2026-01-01', amountHalalas: 50_000 },
      { date: '2026-03-15', amountHalalas: 40_000 },
      { date: '2026-04-20', amountHalalas: 30_000 },
    ], '2026-04-30');

    // 60,000 remains after FIFO settlement: the newest 30,000 + 30,000 of March.
    expect(result).toEqual({
      current: 30_000,
      days31_60: 30_000,
      days61_90: 0,
      days91plus: 0,
      unallocated: 0,
      total: 60_000,
    });
  });

  it('surfaces balances with no attributable source instead of calling them current', () => {
    const result = allocateSupplierBalanceByAge(80_000, [
      { date: '2026-04-20', amountHalalas: 30_000 },
    ], '2026-04-30');

    expect(result.current).toBe(30_000);
    expect(result.unallocated).toBe(50_000);
    expect(result.total).toBe(80_000);
  });

  it('allocates an AP reversal exactly despite per-supplier rounding', () => {
    const result = allocateProRata(10_001, new Map([['s1', 1], ['s2', 1], ['s3', 1]]));
    expect([...result.values()].reduce((sum, amount) => sum + amount, 0)).toBe(10_001);
  });

  it('never creates a negative supplier allocation when the total is smaller than the supplier count', () => {
    const result = allocateProRata(2, new Map([['s1', 1], ['s2', 1], ['s3', 1], ['s4', 1]]));
    expect([...result.values()].reduce((sum, amount) => sum + amount, 0)).toBe(2);
    expect([...result.values()].every((amount) => amount >= 0)).toBe(true);
  });
});
