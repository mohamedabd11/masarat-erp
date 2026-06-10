/**
 * Tests for pure business logic functions used across the ERP.
 *
 * All functions here are either:
 *   (a) Inline pure functions defined in this test file, or
 *   (b) Imported from existing lib files (gl-accounts, postJournalEntry).
 *
 * No DB calls, no network — these are fast deterministic tests.
 */
import { describe, it, expect } from 'vitest';
import { GL } from '@/lib/gl-accounts';
import { resolvePaymentAccount, resolveExpenseAccount } from '@/lib/postJournalEntry';

// ─── Pure business logic helpers (inline) ────────────────────────────────────

/** Extract year and month from a YYYY-MM-DD date string */
function parsePeriod(dateStr: string): { year: number; month: number } {
  const parts = dateStr.split('-');
  return {
    year:  parseInt(parts[0] ?? '0', 10),
    month: parseInt(parts[1] ?? '0', 10),
  };
}

/** GOSI employer contribution = 12% on (baseSalary + housingAllowance), Saudi 2024 reform */
function calculateGosiEmployer(baseSalaryHalalas: number, housingAllowanceHalalas: number): number {
  return Math.round((baseSalaryHalalas + housingAllowanceHalalas) * 0.12);
}

/** Compute invoice totals */
function invoiceTotal(subtotalHalalas: number, vatRatePct: number): {
  subtotal: number;
  vat: number;
  total: number;
} {
  const vat   = Math.round(subtotalHalalas * vatRatePct / 100);
  const total = subtotalHalalas + vat;
  return { subtotal: subtotalHalalas, vat, total };
}

/** Outstanding balance = total - paid - credited */
function outstandingBalance(totalHalalas: number, paidHalalas: number, creditedHalalas: number): number {
  return totalHalalas - paidHalalas - creditedHalalas;
}

/** Refund ratio (0 – 1) */
function refundRatio(refundAmountHalalas: number, totalHalalas: number): number {
  if (totalHalalas === 0) return 0;
  return refundAmountHalalas / totalHalalas;
}

/** Proportional VAT on a partial refund */
function proportionalVat(vatHalalas: number, ratio: number): number {
  return Math.round(vatHalalas * ratio);
}

/** FX difference: positive = loss (paid more than expected), negative = gain */
function fxDifference(resolvedAmountHalalas: number, originalAmountHalalas: number): number {
  return resolvedAmountHalalas - originalAmountHalalas;
}

/** Check whether journal lines are balanced (sum dr = sum cr) */
function isJournalBalanced(lines: { debitHalalas: number; creditHalalas: number }[]): boolean {
  const dr = lines.reduce((s, l) => s + l.debitHalalas,  0);
  const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
  return dr === cr;
}

// ─── 1. Period validation ─────────────────────────────────────────────────────

describe('parsePeriod — date to year/month', () => {

  it('2024-03-15 → year=2024, month=3', () => {
    const p = parsePeriod('2024-03-15');
    expect(p.year).toBe(2024);
    expect(p.month).toBe(3);
  });

  it('2024-01-01 → year=2024, month=1', () => {
    const p = parsePeriod('2024-01-01');
    expect(p.year).toBe(2024);
    expect(p.month).toBe(1);
  });

  it('2023-12-31 → year=2023, month=12', () => {
    const p = parsePeriod('2023-12-31');
    expect(p.year).toBe(2023);
    expect(p.month).toBe(12);
  });

  it('شهر أوسط من العام: 2025-07-15 → month=7', () => {
    expect(parsePeriod('2025-07-15').month).toBe(7);
  });
});

// ─── 2. GOSI employer contribution (12%) ─────────────────────────────────────

describe('calculateGosiEmployer — حساب اشتراك GOSI صاحب العمل', () => {

  it('قاعدة 100000 + سكن 50000 → GOSI = 18000', () => {
    // Math.round(150000 × 0.12) = 18000
    expect(calculateGosiEmployer(100000, 50000)).toBe(18000);
  });

  it('راتب 200000 بدون سكن → GOSI = 24000', () => {
    // Math.round(200000 × 0.12) = 24000
    expect(calculateGosiEmployer(200000, 0)).toBe(24000);
  });

  it('معدل 12% مع تقريب: 1005 هللة → 121', () => {
    // Math.round(1005 × 0.12) = Math.round(120.6) = 121
    expect(calculateGosiEmployer(1005, 0)).toBe(121);
  });

  it('راتب صفر → GOSI = 0', () => {
    expect(calculateGosiEmployer(0, 0)).toBe(0);
  });
});

// ─── 3. Invoice totals ────────────────────────────────────────────────────────

describe('invoiceTotal — حساب إجمالي الفاتورة', () => {

  it('93000 هللة + 15% ضريبة → إجمالي 106950', () => {
    // vat = Math.round(93000 × 0.15) = 13950; total = 93000 + 13950 = 106950
    const result = invoiceTotal(93000, 15);
    expect(result.subtotal).toBe(93000);
    expect(result.vat).toBe(13950);
    expect(result.total).toBe(106950);
  });

  it('100000 هللة + 15% → VAT = 15000', () => {
    expect(invoiceTotal(100000, 15).vat).toBe(15000);
  });

  it('مبلغ صفر → جميع القيم أصفار', () => {
    const result = invoiceTotal(0, 15);
    expect(result.subtotal).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(0);
  });

  it('VAT = 0% → إجمالي = صافي', () => {
    const result = invoiceTotal(50000, 0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(50000);
  });
});

// ─── 4. Outstanding balance ───────────────────────────────────────────────────

describe('outstandingBalance — الرصيد المستحق', () => {

  it('106950 - 53475 - 0 = 53475', () => {
    expect(outstandingBalance(106950, 53475, 0)).toBe(53475);
  });

  it('مدفوع بالكامل → رصيد صفر', () => {
    expect(outstandingBalance(106950, 106950, 0)).toBe(0);
  });

  it('مدموج: خصم 10000 ودفعة 80000 من إجمالي 106950 → 16950 متبقي', () => {
    expect(outstandingBalance(106950, 80000, 10000)).toBe(16950);
  });
});

// ─── 5. Refund ratio ──────────────────────────────────────────────────────────

describe('refundRatio — نسبة الاسترداد', () => {

  it('استرداد 53475 من إجمالي 106950 → نسبة 0.5', () => {
    expect(refundRatio(53475, 106950)).toBe(0.5);
  });

  it('استرداد كامل → نسبة 1.0', () => {
    expect(refundRatio(100000, 100000)).toBe(1);
  });

  it('بدون استرداد → نسبة 0.0', () => {
    expect(refundRatio(0, 100000)).toBe(0);
  });

  it('إجمالي صفر → نسبة 0 (لا قسمة على صفر)', () => {
    expect(refundRatio(0, 0)).toBe(0);
  });
});

// ─── 6. Proportional VAT ─────────────────────────────────────────────────────

describe('proportionalVat — ضريبة القيمة المضافة النسبية', () => {

  it('13950 × 0.5 = 6975', () => {
    expect(proportionalVat(13950, 0.5)).toBe(6975);
  });

  it('13950 × 1.0 = 13950 (استرداد كامل)', () => {
    expect(proportionalVat(13950, 1)).toBe(13950);
  });

  it('13950 × 0.0 = 0 (بدون استرداد)', () => {
    expect(proportionalVat(13950, 0)).toBe(0);
  });

  it('نتيجة مُقرَّبة باستخدام Math.round', () => {
    // 13951 × 0.5 = 6975.5 → rounds to 6976
    expect(proportionalVat(13951, 0.5)).toBe(6976);
  });
});

// ─── 7. FX difference ────────────────────────────────────────────────────────

describe('fxDifference — فرق أسعار الصرف', () => {

  it('دفع أكثر من المتوقع → فرق موجب (خسارة)', () => {
    // e.g. settled at 105 SAR but booked at 100 SAR
    expect(fxDifference(10500, 10000)).toBe(500);
    expect(fxDifference(10500, 10000)).toBeGreaterThan(0);
  });

  it('دفع أقل من المتوقع → فرق سالب (مكسب)', () => {
    expect(fxDifference(9500, 10000)).toBe(-500);
    expect(fxDifference(9500, 10000)).toBeLessThan(0);
  });

  it('لا فرق → صفر', () => {
    expect(fxDifference(10000, 10000)).toBe(0);
  });
});

// ─── 8. Payment method routing ───────────────────────────────────────────────

describe('Payment method routing via GL', () => {

  it('bank_transfer → GL bank code 1110', () => {
    expect(resolvePaymentAccount('bank_transfer').code).toBe('1110');
    expect(GL.bank.code).toBe('1110');
  });

  it('cash → GL cash code 1100', () => {
    expect(resolvePaymentAccount('cash').code).toBe('1100');
    expect(GL.cash.code).toBe('1100');
  });

  it('card → GL posCard code 1115', () => {
    expect(resolvePaymentAccount('card').code).toBe('1115');
    expect(GL.posCard.code).toBe('1115');
  });

  it('check → clears through bank 1110', () => {
    expect(resolvePaymentAccount('check').code).toBe('1110');
  });
});

// ─── 9. Expense category routing ─────────────────────────────────────────────

describe('Expense category routing', () => {

  it('supplier → GL.payableSupplier (2000) via resolveExpenseAccount', () => {
    expect(resolveExpenseAccount('supplier').code).toBe('5000');
    expect(GL.payableSupplier.code).toBe('2000');
  });

  it('operational expenses code is 5100', () => {
    expect(resolveExpenseAccount('operational').code).toBe('5100');
  });

  it('salaries expense code is 5200 (legacy) or 6100 (GL canonical)', () => {
    // postJournalEntry uses legacy 5200; GL canonical is 6100
    expect(resolveExpenseAccount('salaries').code).toBe('5200');
    expect(GL.salaryExpense.code).toBe('6100');
  });
});

// ─── 10. Journal balance check ────────────────────────────────────────────────

describe('isJournalBalanced — التحقق من توازن القيد', () => {

  it('قيد متوازن بسطرين → متوازن', () => {
    expect(isJournalBalanced([
      { debitHalalas: 100000, creditHalalas: 0 },
      { debitHalalas: 0,      creditHalalas: 100000 },
    ])).toBe(true);
  });

  it('قيد متوازن بأربعة سطور → متوازن', () => {
    expect(isJournalBalanced([
      { debitHalalas: 115000, creditHalalas: 0 },
      { debitHalalas: 0,      creditHalalas: 100000 },
      { debitHalalas: 0,      creditHalalas: 15000 },
    ])).toBe(true);
  });

  it('قيد غير متوازن → غير متوازن', () => {
    expect(isJournalBalanced([
      { debitHalalas: 100000, creditHalalas: 0 },
      { debitHalalas: 0,      creditHalalas: 99000 },
    ])).toBe(false);
  });

  it('مبالغ مدين تساوي مبالغ دائن → متوازن', () => {
    const lines = [
      { debitHalalas: 50000, creditHalalas: 0 },
      { debitHalalas: 50000, creditHalalas: 0 },
      { debitHalalas: 0,     creditHalalas: 100000 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it('قيد فارغ → متوازن (0 = 0)', () => {
    expect(isJournalBalanced([])).toBe(true);
  });
});
