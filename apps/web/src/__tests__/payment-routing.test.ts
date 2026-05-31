import { describe, it, expect } from 'vitest';
import {
  resolvePaymentAccount,
  resolveExpenseAccount,
  AC,
} from '@/lib/postJournalEntry';

// ─── resolvePaymentAccount ────────────────────────────────────────────────────

describe('resolvePaymentAccount', () => {
  it('cash → 1100 (Cash on Hand)', () => {
    const ac = resolvePaymentAccount('cash');
    expect(ac.code).toBe('1100');
    expect(ac.type).toBe('asset');
  });

  it('bank_transfer → 1110 (Bank)', () => {
    expect(resolvePaymentAccount('bank_transfer').code).toBe('1110');
  });

  it('check → 1110 (Bank — cheque clears via bank)', () => {
    expect(resolvePaymentAccount('check').code).toBe('1110');
  });

  it('card → 1115 (POS / Card Terminal)', () => {
    expect(resolvePaymentAccount('card').code).toBe('1115');
  });

  it('online → 1115 (treated same as card)', () => {
    expect(resolvePaymentAccount('online').code).toBe('1115');
  });

  it('unknown method → defaults to bank (1110)', () => {
    expect(resolvePaymentAccount('wire').code).toBe('1110');
    expect(resolvePaymentAccount('').code).toBe('1110');
    expect(resolvePaymentAccount('crypto').code).toBe('1110');
  });

  it('all payment accounts are assets', () => {
    for (const method of ['cash', 'bank_transfer', 'check', 'card', 'online']) {
      expect(resolvePaymentAccount(method).type).toBe('asset');
    }
  });
});

// ─── resolveExpenseAccount ────────────────────────────────────────────────────

describe('resolveExpenseAccount', () => {
  it('supplier → 5000 (Cost of Services / COGS)', () => {
    const ac = resolveExpenseAccount('supplier');
    expect(ac.code).toBe('5000');
    expect(ac.type).toBe('expense');
  });

  it('operational → 5100 (Operating Expenses)', () => {
    expect(resolveExpenseAccount('operational').code).toBe('5100');
  });

  it('salaries → 5200 (Salaries & Wages)', () => {
    expect(resolveExpenseAccount('salaries').code).toBe('5200');
  });

  it('office → 5300 (Office Expenses)', () => {
    expect(resolveExpenseAccount('office').code).toBe('5300');
  });

  it('other → 5900 (Other Expenses)', () => {
    expect(resolveExpenseAccount('other').code).toBe('5900');
  });

  it('all expense accounts are of type expense', () => {
    const categories = ['supplier', 'operational', 'salaries', 'office', 'other'] as const;
    for (const cat of categories) {
      expect(resolveExpenseAccount(cat).type).toBe('expense');
    }
  });
});

// ─── Account code catalogue integrity ────────────────────────────────────────

describe('AC constants — no duplicate codes', () => {
  it('every account has a unique code', () => {
    const codes = Object.values(AC).map(a => a.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('asset accounts start with 1', () => {
    const assets = Object.values(AC).filter(a => a.type === 'asset');
    for (const a of assets) expect(a.code.startsWith('1')).toBe(true);
  });

  it('liability accounts start with 2', () => {
    const liabilities = Object.values(AC).filter(a => a.type === 'liability');
    for (const a of liabilities) expect(a.code.startsWith('2')).toBe(true);
  });

  it('revenue accounts start with 4', () => {
    const revenues = Object.values(AC).filter(a => a.type === 'revenue');
    for (const a of revenues) expect(a.code.startsWith('4')).toBe(true);
  });

  it('expense accounts start with 5', () => {
    const expenses = Object.values(AC).filter(a => a.type === 'expense');
    for (const a of expenses) expect(a.code.startsWith('5')).toBe(true);
  });

  it('accounts receivable code matches double-entry tests', () => {
    expect(AC.receivable.code).toBe('1120');
  });

  it('VAT payable code matches ZATCA reporting expectations', () => {
    expect(AC.vatPayable.code).toBe('2200');
  });
});
