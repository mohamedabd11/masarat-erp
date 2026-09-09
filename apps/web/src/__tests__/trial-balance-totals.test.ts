import { describe, expect, it } from 'vitest';
import { totalTrialBalanceRows } from '@/lib/trial-balance-totals';

describe('trial-balance footer totals', () => {
  it('distinguishes gross movements from each account closing balance', () => {
    expect(totalTrialBalanceRows([
      { totalDebit: 100_000, totalCredit: 40_000 },
      { totalDebit: 25_000, totalCredit: 85_000 },
    ])).toEqual({ debit: 125_000, credit: 125_000, balanceDebit: 60_000, balanceCredit: 60_000 });
  });

  it('keeps debit and credit balances separate instead of netting the whole ledger to zero', () => {
    expect(totalTrialBalanceRows([
      { totalDebit: 50_000, totalCredit: 0 },
      { totalDebit: 0, totalCredit: 50_000 },
      { totalDebit: 12_000, totalCredit: 12_000 },
    ])).toEqual({ debit: 62_000, credit: 62_000, balanceDebit: 50_000, balanceCredit: 50_000 });
  });

  it('preserves an imbalance and handles an empty ledger', () => {
    expect(totalTrialBalanceRows([{ totalDebit: 501, totalCredit: 500 }]).balanceDebit).toBe(1);
    expect(totalTrialBalanceRows([])).toEqual({ debit: 0, credit: 0, balanceDebit: 0, balanceCredit: 0 });
  });

  it('reproduces the preview audit: 137066.96 in movements but 70510.00 in balances', () => {
    const movements = [
      [1_468_000, 0], [2_320_250, 1_406_000], [315_750, 0], [5_401_000, 3_304_000],
      [1_329_303, 4_315_000], [14_439, 474_000], [115_000, 615_000],
      [26_954, 77_000], [215_000, 3_215_000], [0, 55_696],
      [2_495_000, 245_000], [6_000, 0],
    ];
    expect(totalTrialBalanceRows(movements.map(([debit, credit]) => ({
      totalDebit: debit!, totalCredit: credit!,
    })))).toEqual({
      debit: 13_706_696, credit: 13_706_696,
      balanceDebit: 7_051_000, balanceCredit: 7_051_000,
    });
  });
});
