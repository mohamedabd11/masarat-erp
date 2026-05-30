import { describe, it, expect } from 'vitest';
import { calculateClosingLines, type PlRow } from '@/lib/fiscal-close';

function row(code: string, dr: number, cr: number, ar = code, en = ''): PlRow {
  return { accountCode: code, accountNameAr: ar, accountNameEn: en, totalDebit: dr, totalCredit: cr };
}

// Helper: verify the closing entry itself is balanced (Dr = Cr)
function isBalanced(lines: { dr: number; cr: number }[]): boolean {
  return lines.reduce((s, l) => s + l.dr - l.cr, 0) === 0;
}

describe('calculateClosingLines', () => {
  it('returns empty lines and zero net income for empty input', () => {
    const result = calculateClosingLines([]);
    expect(result.lines).toHaveLength(0);
    expect(result.netIncomeHalalas).toBe(0);
  });

  it('skips rows with both debit and credit at zero (no-ops)', () => {
    const result = calculateClosingLines([row('4000', 0, 0)]);
    expect(result.lines).toHaveLength(0);
  });

  it('ignores non-P&L account codes (1xxx, 2xxx, 3xxx)', () => {
    const result = calculateClosingLines([
      row('1100', 100000, 0),
      row('2000', 0, 50000),
    ]);
    expect(result.lines).toHaveLength(0);
    expect(result.netIncomeHalalas).toBe(0);
  });

  it('revenue-only: single account, net credit → Dr revenue, Cr RE', () => {
    const result = calculateClosingLines([row('4000', 0, 500000)]);
    // Revenue account normally has credit balance. Closing: Dr 4000 / Cr 3200
    const rev = result.lines.find(l => l.code === '4000')!;
    const re  = result.lines.find(l => l.code === '3200')!;
    expect(rev.dr).toBe(500000);
    expect(rev.cr).toBe(0);
    expect(re.cr).toBe(500000);
    expect(re.dr).toBe(0);
    expect(result.netIncomeHalalas).toBe(500000);
    expect(isBalanced(result.lines)).toBe(true);
  });

  it('expense-only: single account, net debit → Cr expense, Dr RE (loss)', () => {
    const result = calculateClosingLines([row('5000', 300000, 0)]);
    // Expense account normally has debit balance. Closing: Cr 5000 / Dr 3200
    const exp = result.lines.find(l => l.code === '5000')!;
    const re  = result.lines.find(l => l.code === '3200')!;
    expect(exp.cr).toBe(300000);
    expect(exp.dr).toBe(0);
    expect(re.dr).toBe(300000);
    expect(re.cr).toBe(0);
    expect(result.netIncomeHalalas).toBe(-300000);
    expect(isBalanced(result.lines)).toBe(true);
  });

  it('profit scenario: revenue 500k, expenses 300k → net income 200k', () => {
    const result = calculateClosingLines([
      row('4000', 0, 500000, 'إيراد رسوم الوكالة', 'Agency Fees'),
      row('5000', 200000, 0, 'تكلفة الخدمات', 'Cost of Services'),
      row('5200', 100000, 0, 'رواتب', 'Salaries'),
    ]);
    expect(result.netIncomeHalalas).toBe(200000);
    expect(isBalanced(result.lines)).toBe(true);
    const re = result.lines.find(l => l.code === '3200')!;
    expect(re.cr).toBe(200000);
    expect(re.dr).toBe(0);
  });

  it('loss scenario: revenue 200k, expenses 350k → net loss 150k', () => {
    const result = calculateClosingLines([
      row('4000', 0, 200000),
      row('5000', 350000, 0),
    ]);
    expect(result.netIncomeHalalas).toBe(-150000);
    expect(isBalanced(result.lines)).toBe(true);
    const re = result.lines.find(l => l.code === '3200')!;
    expect(re.dr).toBe(150000);
    expect(re.cr).toBe(0);
  });

  it('break-even: revenue equals expenses → no RE line, zero net income', () => {
    const result = calculateClosingLines([
      row('4000', 0, 200000),
      row('5000', 200000, 0),
    ]);
    expect(result.netIncomeHalalas).toBe(0);
    // No RE line when net income is exactly zero
    expect(result.lines.find(l => l.code === '3200')).toBeUndefined();
    // Revenue and expense lines still present (they need to be zeroed)
    expect(result.lines.find(l => l.code === '4000')).toBeDefined();
    expect(result.lines.find(l => l.code === '5000')).toBeDefined();
    expect(isBalanced(result.lines)).toBe(true);
  });

  it('multiple revenue accounts aggregate correctly', () => {
    const result = calculateClosingLines([
      row('4000', 0, 300000),
      row('4100', 0, 200000),
      row('5000', 100000, 0),
    ]);
    expect(result.netIncomeHalalas).toBe(400000);
    expect(isBalanced(result.lines)).toBe(true);
    const re = result.lines.find(l => l.code === '3200')!;
    expect(re.cr).toBe(400000);
  });

  it('revenue account with abnormal debit balance closes correctly', () => {
    // e.g. over-accrued then reversed — net is a debit on revenue account
    const result = calculateClosingLines([row('4000', 50000, 30000)]);
    // netCredit = 30000 - 50000 = -20000 → revenue has abnormal dr balance
    const rev = result.lines.find(l => l.code === '4000')!;
    expect(rev.cr).toBe(20000); // Cr to close the abnormal Dr balance
    expect(rev.dr).toBe(0);
    expect(result.netIncomeHalalas).toBe(-20000);
  });

  it('halalas precision — handles large integer values correctly', () => {
    // 1,000,000 SAR = 100,000,000 halalas
    const result = calculateClosingLines([
      row('4000', 0, 100_000_000),
      row('5000', 60_000_000, 0),
    ]);
    expect(result.netIncomeHalalas).toBe(40_000_000);
    expect(isBalanced(result.lines)).toBe(true);
  });

  it('null account name fields default to code string', () => {
    const result = calculateClosingLines([
      { accountCode: '4000', accountNameAr: null, accountNameEn: null, totalDebit: 0, totalCredit: 100000 },
    ]);
    const rev = result.lines.find(l => l.code === '4000')!;
    expect(rev.ar).toBe('4000');
    expect(rev.en).toBe('');
  });
});
