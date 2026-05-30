import { describe, it, expect } from 'vitest';
import {
  buildInvoiceLines,
  buildPaymentReceivedLines,
  buildRefundLines,
  buildSupplierPaymentLines,
  buildExpensePaymentLines,
  resolvePaymentAccount,
  resolveExpenseAccount,
  AC,
} from '@/lib/postJournalEntry';

// Helper: sum debits - sum credits must equal 0 (double-entry invariant)
function isBalanced(lines: { debitHalalas: number; creditHalalas: number }[]): boolean {
  const totalDr = lines.reduce((s, l) => s + l.debitHalalas, 0);
  const totalCr = lines.reduce((s, l) => s + l.creditHalalas, 0);
  return totalDr === totalCr;
}

describe('buildInvoiceLines', () => {
  it('returns empty array for zero grand total', () => {
    const lines = buildInvoiceLines({ revenueModel: 'agent', isVatRegistered: false, grandTotal: 0, totalCost: 0, serviceFee: 0, vatAmount: 0, subtotalExclVat: 0 });
    expect(lines).toHaveLength(0);
  });

  it('agent model with cost/fee breakdown — balanced', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'agent', isVatRegistered: false,
      grandTotal: 120000, totalCost: 100000, serviceFee: 20000,
      vatAmount: 0, subtotalExclVat: 120000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(lines.find(l => l.accountCode === AC.receivable.code)?.debitHalalas).toBe(120000);
    expect(lines.find(l => l.accountCode === AC.payableSupplier.code)?.creditHalalas).toBe(100000);
    expect(lines.find(l => l.accountCode === AC.revenueAgent.code)?.creditHalalas).toBe(20000);
  });

  it('agent model with VAT — balanced and VAT account present', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'agent', isVatRegistered: true,
      grandTotal: 115000, totalCost: 80000, serviceFee: 20869, // ~87000/1.15
      vatAmount: 14131, subtotalExclVat: 100000,
    });
    expect(isBalanced(lines)).toBe(true);
    const vat = lines.find(l => l.accountCode === AC.vatPayable.code);
    expect(vat).toBeDefined();
    expect(vat!.creditHalalas).toBe(14131);
  });

  it('agent model no breakdown, VAT registered — fallback path balanced', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'agent', isVatRegistered: true,
      grandTotal: 115000, totalCost: 0, serviceFee: 0,
      vatAmount: 15000, subtotalExclVat: 100000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it('agent model no breakdown, no VAT — simplest path', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'agent', isVatRegistered: false,
      grandTotal: 100000, totalCost: 0, serviceFee: 0,
      vatAmount: 0, subtotalExclVat: 100000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.accountCode).toBe(AC.receivable.code);
    expect(lines[1]!.accountCode).toBe(AC.revenueAgent.code);
  });

  it('principal model with VAT — balanced', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'principal', isVatRegistered: true,
      grandTotal: 115000, totalCost: 0, serviceFee: 0,
      vatAmount: 15000, subtotalExclVat: 100000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(lines.find(l => l.accountCode === AC.revenuePrincipal.code)?.creditHalalas).toBe(100000);
    expect(lines.find(l => l.accountCode === AC.vatPayable.code)?.creditHalalas).toBe(15000);
  });

  it('principal model no VAT — 2 lines balanced', () => {
    const lines = buildInvoiceLines({
      revenueModel: 'principal', isVatRegistered: false,
      grandTotal: 50000, totalCost: 0, serviceFee: 0,
      vatAmount: 0, subtotalExclVat: 50000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.accountCode).toBe(AC.revenuePrincipal.code);
  });
});

describe('buildPaymentReceivedLines', () => {
  it('cash payment — Dr Cash, Cr Receivable, balanced', () => {
    const lines = buildPaymentReceivedLines(50000, 'cash');
    expect(isBalanced(lines)).toBe(true);
    expect(lines[0]!.accountCode).toBe(AC.cash.code);
    expect(lines[0]!.debitHalalas).toBe(50000);
    expect(lines[1]!.accountCode).toBe(AC.receivable.code);
    expect(lines[1]!.creditHalalas).toBe(50000);
  });

  it('bank transfer — Dr Bank, Cr Receivable', () => {
    const lines = buildPaymentReceivedLines(200000, 'bank_transfer');
    expect(isBalanced(lines)).toBe(true);
    expect(lines[0]!.accountCode).toBe(AC.bank.code);
  });

  it('card payment — Dr POS, Cr Receivable', () => {
    const lines = buildPaymentReceivedLines(75000, 'card');
    expect(lines[0]!.accountCode).toBe(AC.pos.code);
  });

  it('defaults to bank when method unknown', () => {
    const lines = buildPaymentReceivedLines(10000, 'unknown_method');
    expect(lines[0]!.accountCode).toBe(AC.bank.code);
  });
});

describe('buildRefundLines', () => {
  it('returns empty for zero amount', () => {
    expect(buildRefundLines(0, false, 'agent')).toHaveLength(0);
  });

  it('agent refund no VAT — Dr Revenue, Cr Cash, balanced', () => {
    const lines = buildRefundLines(50000, false, 'agent', 'cash');
    expect(isBalanced(lines)).toBe(true);
    expect(lines[0]!.accountCode).toBe(AC.revenueAgent.code);
    expect(lines[0]!.debitHalalas).toBe(50000);
    expect(lines[1]!.accountCode).toBe(AC.cash.code);
    expect(lines[1]!.creditHalalas).toBe(50000);
  });

  it('principal refund with VAT — 3 lines balanced', () => {
    const lines = buildRefundLines(115000, true, 'principal', 'bank_transfer');
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toHaveLength(3);
    const vatLine = lines.find(l => l.accountCode === AC.vatPayable.code);
    expect(vatLine).toBeDefined();
    const exclVat = Math.round(115000 / 1.15);
    expect(lines[0]!.debitHalalas).toBe(exclVat);
    expect(lines[2]!.creditHalalas).toBe(115000);
  });
});

describe('buildSupplierPaymentLines', () => {
  it('Dr Payable, Cr Bank, balanced', () => {
    const lines = buildSupplierPaymentLines(80000, 'bank_transfer');
    expect(isBalanced(lines)).toBe(true);
    expect(lines[0]!.accountCode).toBe(AC.payableSupplier.code);
    expect(lines[0]!.debitHalalas).toBe(80000);
    expect(lines[1]!.accountCode).toBe(AC.bank.code);
    expect(lines[1]!.creditHalalas).toBe(80000);
  });
});

describe('buildExpensePaymentLines', () => {
  it('salaries expense — Dr Salaries, Cr Bank, balanced', () => {
    const lines = buildExpensePaymentLines(300000, 'bank_transfer', 'salaries');
    expect(isBalanced(lines)).toBe(true);
    expect(lines[0]!.accountCode).toBe(AC.salariesExpenses.code);
  });

  it('office expense — Dr Office Expenses', () => {
    const lines = buildExpensePaymentLines(5000, 'cash', 'office');
    expect(lines[0]!.accountCode).toBe(AC.officeExpenses.code);
    expect(lines[1]!.accountCode).toBe(AC.cash.code);
    expect(isBalanced(lines)).toBe(true);
  });

  it('unknown category falls back to other expenses', () => {
    const lines = buildExpensePaymentLines(1000, 'cash', 'other');
    expect(lines[0]!.accountCode).toBe(AC.otherExpenses.code);
  });
});

describe('resolvePaymentAccount', () => {
  it('maps known methods correctly', () => {
    expect(resolvePaymentAccount('cash').code).toBe('1100');
    expect(resolvePaymentAccount('bank_transfer').code).toBe('1110');
    expect(resolvePaymentAccount('check').code).toBe('1110');
    expect(resolvePaymentAccount('card').code).toBe('1115');
    expect(resolvePaymentAccount('online').code).toBe('1115');
  });

  it('unknown method defaults to bank', () => {
    expect(resolvePaymentAccount('wire').code).toBe('1110');
  });
});

describe('resolveExpenseAccount', () => {
  it('maps all categories', () => {
    expect(resolveExpenseAccount('supplier').code).toBe('5000');
    expect(resolveExpenseAccount('operational').code).toBe('5100');
    expect(resolveExpenseAccount('salaries').code).toBe('5200');
    expect(resolveExpenseAccount('office').code).toBe('5300');
    expect(resolveExpenseAccount('other').code).toBe('5900');
  });
});
