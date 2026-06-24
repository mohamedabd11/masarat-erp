/**
 * Unit tests — buildCustomerReceiptLines + buildRevenueRecognitionLines
 * (lib/payment-journal). The shared receipt/recognition postings used by
 * payments/record, the installment-pay route, and invoices/recognize-revenue.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCustomerReceiptLines,
  buildRevenueRecognitionLines,
  type SimpleJournalLine,
} from '@/lib/payment-journal';

const sum  = (ls: SimpleJournalLine[], k: 'dr' | 'cr') => ls.reduce((s, l) => s + l[k], 0);
const drOf = (ls: SimpleJournalLine[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.dr, 0);
const crOf = (ls: SimpleJournalLine[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.cr, 0);
const balanced = (ls: SimpleJournalLine[]) => sum(ls, 'dr') === sum(ls, 'cr');

describe('buildCustomerReceiptLines', () => {
  it('cash → Dr 1100 / Cr AR 1120, balanced', () => {
    const ls = buildCustomerReceiptLines(500_00, 'cash');
    expect(drOf(ls, '1100')).toBe(500_00);
    expect(crOf(ls, '1120')).toBe(500_00);
    expect(balanced(ls)).toBe(true);
  });
  it('bank_transfer → Dr 1110', () => {
    expect(drOf(buildCustomerReceiptLines(500_00, 'bank_transfer'), '1110')).toBe(500_00);
  });
  it('card and online → Dr 1115 (POS)', () => {
    expect(drOf(buildCustomerReceiptLines(500_00, 'card'),   '1115')).toBe(500_00);
    expect(drOf(buildCustomerReceiptLines(500_00, 'online'), '1115')).toBe(500_00);
  });
  it('unknown method falls back to Bank 1110', () => {
    expect(drOf(buildCustomerReceiptLines(500_00, 'cheque'), '1110')).toBe(500_00);
  });
});

describe('buildRevenueRecognitionLines', () => {
  it('principal → Dr 3201 deferred / Cr 4100, balanced', () => {
    const ls = buildRevenueRecognitionLines(10_000_00, 'principal');
    expect(drOf(ls, '3201')).toBe(10_000_00);
    expect(crOf(ls, '4100')).toBe(10_000_00);
    expect(balanced(ls)).toBe(true);
  });
  it('agent → Cr 4000 (agency fee) instead of 4100', () => {
    const ls = buildRevenueRecognitionLines(10_000_00, 'agent');
    expect(crOf(ls, '4000')).toBe(10_000_00);
    expect(crOf(ls, '4100')).toBe(0);
    expect(drOf(ls, '3201')).toBe(10_000_00);
    expect(balanced(ls)).toBe(true);
  });
});
