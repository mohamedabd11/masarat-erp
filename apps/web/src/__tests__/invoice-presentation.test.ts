import { describe, expect, it } from 'vitest';
import { invoiceOutstanding, signedInvoiceTotal, summarizeInvoiceDocuments } from '@/lib/invoice-presentation';

describe('invoice presentation after refunds', () => {
  const original = {
    type: '380', status: 'refunded', totalHalalas: 115_000, paidHalalas: 0,
  };
  const creditNote = {
    type: '381', status: 'issued', totalHalalas: 100_000, paidHalalas: 100_000,
  };

  it('treats credit notes as deductions from invoiced value', () => {
    expect(signedInvoiceTotal(original)).toBe(115_000);
    expect(signedInvoiceTotal(creditNote)).toBe(-100_000);
    expect(summarizeInvoiceDocuments([original, creditNote]).totalInvoiced).toBe(15_000);
  });

  it('does not show refunded invoices or credit notes as collectible balances', () => {
    expect(invoiceOutstanding(original)).toBe(0);
    expect(invoiceOutstanding(creditNote)).toBe(0);
    expect(summarizeInvoiceDocuments([original, creditNote]).totalOutstanding).toBe(0);
  });
});
