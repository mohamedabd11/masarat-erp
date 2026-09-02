import { describe, expect, it } from 'vitest';
import {
  invoiceDocumentLabel,
  invoiceOutstanding,
  signedInvoiceTotal,
  summarizeInvoiceDocuments,
  vatCategoryLabel,
} from '@/lib/invoice-presentation';

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

describe('VAT category presentation', () => {
  it('distinguishes outside-scope, zero-rated, and exempt lines', () => {
    expect(vatCategoryLabel('O', true)).toBe('خارج النطاق');
    expect(vatCategoryLabel('Z', true)).toBe('صفرية');
    expect(vatCategoryLabel('E', true)).toBe('معفى');
    expect(vatCategoryLabel('O', false)).toBe('Outside scope');
  });
});

describe('invoice document labels', () => {
  it('labels B2C tax credit notes as credit notes rather than invoices', () => {
    expect(invoiceDocumentLabel('381', true, false)).toEqual({
      ar: 'إشعار دائن ضريبي مبسط (مرحلة أولى)',
      en: 'Simplified Tax Credit Note (Phase 1)',
    });
  });

  it('preserves B2B and non-VAT document distinctions', () => {
    expect(invoiceDocumentLabel('381', true, true).ar).toBe('إشعار دائن ضريبي (مرحلة أولى)');
    expect(invoiceDocumentLabel('381', false, false).ar).toBe('إشعار دائن تجاري');
    expect(invoiceDocumentLabel('388', true, false).ar).toBe('فاتورة ضريبية مبسطة (مرحلة أولى)');
  });
});
