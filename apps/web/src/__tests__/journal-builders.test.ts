import { describe, it, expect } from 'vitest';
import {
  buildInvoiceLines,
  buildPaymentReceivedLines,
  buildRefundLines,
  buildSupplierPaymentLines,
  buildExpensePaymentLines,
} from '@/lib/postJournalEntry';

// ─── Helper: always verify double-entry holds ─────────────────────────────────

function assertBalanced(lines: { debitHalalas: number; creditHalalas: number }[]) {
  const dr = lines.reduce((s, l) => s + l.debitHalalas,  0);
  const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
  expect(dr).toBe(cr);
  expect(lines.length).toBeGreaterThanOrEqual(2);
}

// ─── buildInvoiceLines ────────────────────────────────────────────────────────

describe('buildInvoiceLines', () => {

  it('principal model — no VAT: Dr AR / Cr Revenue', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'principal', isVatRegistered: false,
      grandTotal: 100000, totalCost: 0, serviceFee: 0, vatAmount: 0, subtotalExclVat: 100000,
    });
    assertBalanced(lines);
    const ar  = lines.find(l => l.accountCode === '1120');
    const rev = lines.find(l => l.accountCode === '4100');
    expect(ar?.debitHalalas).toBe(100000);
    expect(rev?.creditHalalas).toBe(100000);
  });

  it('principal model — with 15% VAT: Dr AR / Cr Revenue / Cr VAT Payable', () => {
    const grandTotal     = 115000;
    const subtotalExclVat = 100000;
    const vatAmount       = 15000;
    const lines = buildInvoiceLines({
      revenueModel: 'principal', isVatRegistered: true,
      grandTotal, totalCost: 0, serviceFee: 0, vatAmount, subtotalExclVat,
    });
    assertBalanced(lines);
    const ar  = lines.find(l => l.accountCode === '1120');
    const rev = lines.find(l => l.accountCode === '4100');
    const vat = lines.find(l => l.accountCode === '2200');
    expect(ar?.debitHalalas).toBe(115000);
    expect(rev?.creditHalalas).toBe(100000);
    expect(vat?.creditHalalas).toBe(15000);
  });

  it('agent model — with cost and fee breakdown', () => {
    // selling 100000, cost 70000, fee 30000
    const lines = buildInvoiceLines({
      revenueModel: 'agent', isVatRegistered: false,
      grandTotal: 100000, totalCost: 70000, serviceFee: 30000, vatAmount: 0, subtotalExclVat: 100000,
    });
    assertBalanced(lines);
    const ar  = lines.find(l => l.accountCode === '1120');
    const ap  = lines.find(l => l.accountCode === '2000');
    const rev = lines.find(l => l.accountCode === '4000');
    expect(ar?.debitHalalas).toBe(100000);
    expect(ap?.creditHalalas).toBe(70000);
    expect(rev?.creditHalalas).toBe(30000);
  });

  it('agent model — with VAT on fee only', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'agent', isVatRegistered: true,
      grandTotal: 115000, totalCost: 80000, serviceFee: 30000, vatAmount: 5000, subtotalExclVat: 110000,
    });
    assertBalanced(lines);
    const vat = lines.find(l => l.accountCode === '2200');
    expect(vat?.creditHalalas).toBe(5000);
  });

  it('يُعيد مصفوفة فارغة إذا grandTotal = 0', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'principal', isVatRegistered: false,
      grandTotal: 0, totalCost: 0, serviceFee: 0, vatAmount: 0, subtotalExclVat: 0,
    });
    expect(lines).toHaveLength(0);
  });
});

// ─── buildPaymentReceivedLines ────────────────────────────────────────────────

describe('buildPaymentReceivedLines', () => {

  it('cash payment: Dr Cash / Cr AR', () => {
    const lines = buildPaymentReceivedLines(50000, 'cash');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '1100')?.debitHalalas).toBe(50000);
    expect(lines.find(l => l.accountCode === '1120')?.creditHalalas).toBe(50000);
  });

  it('bank transfer: Dr Bank / Cr AR', () => {
    const lines = buildPaymentReceivedLines(75000, 'bank_transfer');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '1110')?.debitHalalas).toBe(75000);
  });

  it('card/POS: Dr POS / Cr AR', () => {
    const lines = buildPaymentReceivedLines(25000, 'card');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '1115')?.debitHalalas).toBe(25000);
  });

  it('unknown method: defaults to bank', () => {
    const lines = buildPaymentReceivedLines(10000, 'wire');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '1110')?.debitHalalas).toBe(10000);
  });
});

// ─── buildRefundLines ─────────────────────────────────────────────────────────

describe('buildRefundLines', () => {

  it('refund without VAT — principal model', () => {
    const lines = buildRefundLines(50000, false, 'principal', 'cash');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '4100')?.debitHalalas).toBe(50000);
    expect(lines.find(l => l.accountCode === '1100')?.creditHalalas).toBe(50000);
  });

  it('refund with VAT: يحسب VAT بشكل صحيح (tax-inclusive)', () => {
    const lines = buildRefundLines(115000, true, 'principal', 'bank_transfer');
    assertBalanced(lines);
    const vat = lines.find(l => l.accountCode === '2200');
    expect(vat).toBeDefined();
    // VAT = 115000 - round(115000/1.15) = 15000
    expect(vat?.debitHalalas).toBe(15000);
  });

  it('يُعيد مصفوفة فارغة إذا refundAmount = 0', () => {
    expect(buildRefundLines(0, false, 'principal')).toHaveLength(0);
  });
});

// ─── buildSupplierPaymentLines ────────────────────────────────────────────────

describe('buildSupplierPaymentLines', () => {

  it('Dr AP Suppliers / Cr Bank', () => {
    const lines = buildSupplierPaymentLines(60000, 'bank_transfer');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '2000')?.debitHalalas).toBe(60000);
    expect(lines.find(l => l.accountCode === '1110')?.creditHalalas).toBe(60000);
  });

  it('cheque maps to bank account', () => {
    const lines = buildSupplierPaymentLines(30000, 'check');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '1110')?.creditHalalas).toBe(30000);
  });
});

// ─── buildExpensePaymentLines ─────────────────────────────────────────────────

describe('buildExpensePaymentLines', () => {

  it('operational expense: Dr Operating Expenses / Cr Cash', () => {
    const lines = buildExpensePaymentLines(5000, 'cash', 'operational');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '5100')?.debitHalalas).toBe(5000);
    expect(lines.find(l => l.accountCode === '1100')?.creditHalalas).toBe(5000);
  });

  it('salaries expense: Dr Salaries / Cr Bank', () => {
    const lines = buildExpensePaymentLines(200000, 'bank_transfer', 'salaries');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '5200')?.debitHalalas).toBe(200000);
  });

  it('supplier cost: Dr COGS', () => {
    const lines = buildExpensePaymentLines(80000, 'bank_transfer', 'supplier');
    assertBalanced(lines);
    expect(lines.find(l => l.accountCode === '5000')?.debitHalalas).toBe(80000);
  });
});
