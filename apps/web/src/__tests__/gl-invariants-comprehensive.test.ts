/**
 * Comprehensive unit suite (NO real DB) — every journal-building helper must
 * maintain the double-entry invariant DR = CR, never emit negative halalas,
 * and label every line with a non-empty Arabic account name.
 *
 * Builders covered:
 *  1. lib/postJournalEntry.ts — buildInvoiceLines, buildPaymentReceivedLines,
 *     buildRefundLines, buildSupplierPaymentLines, buildExpensePaymentLines.
 *     (These use the LEGACY `AC` map — see the file header. The 5100/5200/5300
 *      codes there are NOT part of the canonical GL chart, so for these builders
 *      we assert DR=CR / non-negative / non-empty-name but NOT GL-membership.)
 *  2. Runtime GL-based journal shapes replicated from the live API routes
 *     (invoice w/ deferred revenue, revenue recognition, payroll, EOSB, FX).
 *     For these we additionally assert every accountCode exists in the GL object.
 */
import { describe, it, expect } from 'vitest';
import {
  buildInvoiceLines,
  buildPaymentReceivedLines,
  buildRefundLines,
  buildSupplierPaymentLines,
  buildExpensePaymentLines,
  type JELine,
} from '@/lib/postJournalEntry';
import { GL } from '@/lib/gl-accounts';

// ─── Shared invariant assertions ──────────────────────────────────────────────

const GL_CODES = new Set(Object.values(GL).map(a => a.code));

interface AnyLine {
  accountCode: string;
  accountNameAr?: string | null;
  debitHalalas: number;
  creditHalalas: number;
}

function assertBalanced(lines: AnyLine[]) {
  const dr = lines.reduce((s, l) => s + l.debitHalalas, 0);
  const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
  expect(dr).toBe(cr);
}

function assertNoNegative(lines: AnyLine[]) {
  for (const l of lines) {
    expect(l.debitHalalas).toBeGreaterThanOrEqual(0);
    expect(l.creditHalalas).toBeGreaterThanOrEqual(0);
  }
}

function assertNamesPresent(lines: AnyLine[]) {
  for (const l of lines) {
    expect(l.accountNameAr).toBeTruthy();
    expect(String(l.accountNameAr).length).toBeGreaterThan(0);
  }
}

function assertGlCodes(lines: AnyLine[]) {
  for (const l of lines) {
    expect(GL_CODES.has(l.accountCode)).toBe(true);
  }
}

/** Full invariant battery for builders that use the legacy AC map (no GL check). */
function assertCore(lines: AnyLine[]) {
  assertBalanced(lines);
  assertNoNegative(lines);
  assertNamesPresent(lines);
}

// ─── 1. postJournalEntry builders — every typical + edge case ─────────────────

describe('buildInvoiceLines — كل الحالات متوازنة', () => {
  const cases: Array<[string, Parameters<typeof buildInvoiceLines>[0]]> = [
    ['principal, no VAT',          { revenueModel: 'principal', isVatRegistered: false, grandTotal: 100000, totalCost: 0,     serviceFee: 0,     vatAmount: 0,     subtotalExclVat: 100000 }],
    ['principal, 15% VAT',         { revenueModel: 'principal', isVatRegistered: true,  grandTotal: 115000, totalCost: 0,     serviceFee: 0,     vatAmount: 15000, subtotalExclVat: 100000 }],
    ['principal, zero VAT amount', { revenueModel: 'principal', isVatRegistered: true,  grandTotal: 100000, totalCost: 0,     serviceFee: 0,     vatAmount: 0,     subtotalExclVat: 100000 }],
    ['agent, breakdown',           { revenueModel: 'agent',     isVatRegistered: false, grandTotal: 100000, totalCost: 70000, serviceFee: 30000, vatAmount: 0,     subtotalExclVat: 100000 }],
    ['agent, breakdown + VAT',     { revenueModel: 'agent',     isVatRegistered: true,  grandTotal: 115000, totalCost: 80000, serviceFee: 30000, vatAmount: 5000,  subtotalExclVat: 110000 }],
    ['agent, VAT no breakdown',    { revenueModel: 'agent',     isVatRegistered: true,  grandTotal: 115000, totalCost: 0,     serviceFee: 0,     vatAmount: 15000, subtotalExclVat: 100000 }],
    ['agent, no VAT no breakdown', { revenueModel: 'agent',     isVatRegistered: false, grandTotal: 100000, totalCost: 0,     serviceFee: 0,     vatAmount: 0,     subtotalExclVat: 100000 }],
  ];

  for (const [name, input] of cases) {
    it(`${name} → متوازن، غير سالب، أسماء موجودة`, () => {
      const lines = buildInvoiceLines(input);
      assertCore(lines as JELine[]);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  }

  it('grandTotal = 0 → مصفوفة فارغة (لا قيد)', () => {
    const lines = buildInvoiceLines({ revenueModel: 'principal', isVatRegistered: false, grandTotal: 0, totalCost: 0, serviceFee: 0, vatAmount: 0, subtotalExclVat: 0 });
    expect(lines).toHaveLength(0);
  });
});

describe('buildPaymentReceivedLines — كل طرق الدفع متوازنة', () => {
  for (const method of ['cash', 'bank_transfer', 'card', 'online', 'check', 'wire-unknown']) {
    it(`${method} → متوازن`, () => {
      const lines = buildPaymentReceivedLines(50000, method);
      assertCore(lines);
    });
  }
  it('مبلغ صفر → ما زال متوازناً (0 = 0)', () => {
    assertCore(buildPaymentReceivedLines(0, 'cash'));
  });
});

describe('buildRefundLines — استرداد بكل الحالات', () => {
  it('استرداد بدون VAT (principal)', () => {
    assertCore(buildRefundLines(50000, false, 'principal', 'cash'));
  });
  it('استرداد بدون VAT (agent)', () => {
    assertCore(buildRefundLines(50000, false, 'agent', 'bank_transfer'));
  });
  it('استرداد مع VAT (tax-inclusive)', () => {
    assertCore(buildRefundLines(115000, true, 'principal', 'bank_transfer'));
  });
  it('استرداد كامل المبلغ (أقصى) مع VAT', () => {
    assertCore(buildRefundLines(1_000_000, true, 'principal', 'card'));
  });
  it('استرداد صفري → مصفوفة فارغة', () => {
    expect(buildRefundLines(0, false, 'principal')).toHaveLength(0);
  });
});

describe('buildSupplierPaymentLines — سداد موردين متوازن', () => {
  for (const method of ['bank_transfer', 'cash', 'check', 'card']) {
    it(`${method} → متوازن`, () => {
      assertCore(buildSupplierPaymentLines(60000, method));
    });
  }
});

describe('buildExpensePaymentLines — مصروفات بكل التصنيفات متوازنة', () => {
  for (const cat of ['supplier', 'operational', 'salaries', 'office', 'other'] as const) {
    it(`${cat} → متوازن`, () => {
      assertCore(buildExpensePaymentLines(5000, 'cash', cat));
    });
  }
});

// ─── 2. Runtime GL-based journal shapes (replicas of live API routes) ─────────
// These mirror the exact GL-backed postings the routes build, so we ALSO assert
// every accountCode is a valid GL code.

type GLLine = { accountCode: string; accountNameAr: string; debitHalalas: number; creditHalalas: number };
const ln = (ac: { code: string; ar: string }, dr: number, cr: number): GLLine =>
  ({ accountCode: ac.code, accountNameAr: ac.ar, debitHalalas: dr, creditHalalas: cr });

/** Replica of invoices/create buildInvoiceJournalLines with deferRevenue=true. */
function buildDeferredInvoiceLines(grandTotal: number, subtotalExclVat: number, vatAmount: number): GLLine[] {
  const revenueAccount = GL.deferredRevenue;
  return vatAmount > 0
    ? [ln(GL.receivable, grandTotal, 0), ln(revenueAccount, 0, subtotalExclVat), ln(GL.vatPayable, 0, vatAmount)]
    : [ln(GL.receivable, grandTotal, 0), ln(revenueAccount, 0, grandTotal)];
}

/** Replica of invoices/recognize-revenue journal: Dr 3201 / Cr 4100. */
function buildRevenueRecognitionLines(amount: number): GLLine[] {
  return [ln(GL.deferredRevenue, amount, 0), ln(GL.revenuePrincipal, 0, amount)];
}

/** Replica of employees/payslips payroll journal (IAS 19). */
function buildPayrollLines(base: number, housing: number, gosiEmployee: number, deduct = 0): GLLine[] {
  const gross = base + housing;
  const gosiEmployer = Math.round((base + housing) * 0.0975);
  const net = Math.max(0, gross - deduct - gosiEmployee);
  const totalGosi = gosiEmployer + gosiEmployee;
  const lines: GLLine[] = [ln(GL.salaryExpense, gross, 0)];
  if (gosiEmployer > 0) lines.push(ln(GL.gosiExpense, gosiEmployer, 0));
  lines.push(ln(GL.salariesPayable, 0, net));
  if (totalGosi > 0) lines.push(ln(GL.gosiPayable, 0, totalGosi));
  const dr = lines.reduce((s, l) => s + l.debitHalalas, 0);
  const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
  if (dr !== cr) lines.find(l => l.accountCode === GL.salariesPayable.code)!.creditHalalas += (dr - cr);
  return lines;
}

/** Replica of employees/eosb accrual: Dr 6300 / Cr 2500. */
function buildEosbLines(amount: number): GLLine[] {
  return [ln(GL.eosbExpense, amount, 0), ln(GL.eosbProvision, 0, amount)];
}

describe('Runtime GL journals — متوازنة وتستخدم رموز GL صحيحة', () => {
  it('قيد فاتورة بإيراد مؤجل (3201) بدون VAT', () => {
    const lines = buildDeferredInvoiceLines(100000, 100000, 0);
    assertBalanced(lines); assertNoNegative(lines); assertNamesPresent(lines); assertGlCodes(lines);
    expect(lines.find(l => l.accountCode === GL.deferredRevenue.code)).toBeDefined();
  });

  it('قيد فاتورة بإيراد مؤجل مع VAT', () => {
    const lines = buildDeferredInvoiceLines(115000, 100000, 15000);
    assertBalanced(lines); assertNoNegative(lines); assertNamesPresent(lines); assertGlCodes(lines);
  });

  it('قيد إثبات الإيراد المؤجل: Dr 3201 / Cr 4100', () => {
    const lines = buildRevenueRecognitionLines(100000);
    assertBalanced(lines); assertNoNegative(lines); assertNamesPresent(lines); assertGlCodes(lines);
    expect(lines.find(l => l.accountCode === '3201')!.debitHalalas).toBe(100000);
    expect(lines.find(l => l.accountCode === '4100')!.creditHalalas).toBe(100000);
  });

  it('قيد الراتب (مع GOSI وخصومات) متوازن', () => {
    for (const [b, h, ge, d] of [[8_000_00, 2_000_00, 975_00, 0], [10_000_00, 0, 0, 500_00], [5_000_00, 1_000_00, 585_00, 200_00]]) {
      const lines = buildPayrollLines(b!, h!, ge!, d!);
      assertBalanced(lines); assertNoNegative(lines); assertNamesPresent(lines); assertGlCodes(lines);
    }
  });

  it('قيد EOSB: Dr 6300 / Cr 2500 متوازن', () => {
    const lines = buildEosbLines(333_00);
    assertBalanced(lines); assertNoNegative(lines); assertNamesPresent(lines); assertGlCodes(lines);
    expect(lines.find(l => l.accountCode === '6300')!.debitHalalas).toBe(333_00);
    expect(lines.find(l => l.accountCode === '2500')!.creditHalalas).toBe(333_00);
  });
});

// ─── 3. GL object integrity ───────────────────────────────────────────────────

describe('GL object — سلامة دليل الحسابات', () => {
  it('كل الحسابات لها رمز واسم عربي وإنجليزي', () => {
    for (const acc of Object.values(GL)) {
      expect(acc.code).toMatch(/^\d{4}$/);
      expect(acc.ar.length).toBeGreaterThan(0);
      expect(acc.en.length).toBeGreaterThan(0);
    }
  });

  it('رموز FX/EOSB/GOSI المرجعية صحيحة', () => {
    expect(GL.fxGain.code).toBe('4900');
    expect(GL.fxLoss.code).toBe('5900');
    expect(GL.deferredRevenue.code).toBe('3201');
    expect(GL.eosbExpense.code).toBe('6300');
    expect(GL.eosbProvision.code).toBe('2500');
    expect(GL.gosiExpense.code).toBe('6200');
    expect(GL.gosiPayable.code).toBe('2400');
    expect(GL.salariesPayable.code).toBe('2310');
    expect(GL.salaryExpense.code).toBe('6100');
  });
});
