import { describe, expect, it } from 'vitest';
import { prepareQuote, presentQuote, validateQuoteTax } from '@/lib/quote-presentation';

describe('quote presentation contract', () => {
  it('يحفظ جميع الحقول التي ترسلها شاشة عرض السعر دون فقدها', () => {
    const quote = prepareQuote({
      quoteNumber: 'QT-1', customerNameAr: 'عميل', customerNameEn: 'Customer',
      customerEmail: 'demo@example.com', customerPhone: '0500000000',
      items: [{ serviceType: 'flight', description: 'رحلة', quantity: 2, unitPriceSAR: 100 }],
      subtotalHalalas: 20_000, vatHalalas: 3_000, grandTotalHalalas: 23_000,
      issueDate: Date.UTC(2026, 7, 1), expiryDate: Date.UTC(2026, 7, 8),
      status: 'draft', notes: 'ملاحظة', terms: 'شروط',
    });
    expect(quote).toMatchObject({
      customerName: 'عميل', customerNameEn: 'Customer', customerEmail: 'demo@example.com',
      subtotalHalalas: 20_000, vatHalalas: 3_000, totalHalalas: 23_000,
      issueDate: '2026-08-01', validUntil: '2026-08-08', terms: 'شروط',
    });
  });

  it('يرفض المجاميع غير المتطابقة أو عرضاً بلا خدمات', () => {
    expect(() => prepareQuote({ quoteNumber: 'QT-1', customerNameAr: 'عميل', items: [] })).toThrow(/خدمة/);
    expect(() => prepareQuote({
      quoteNumber: 'QT-1', customerNameAr: 'عميل',
      items: [{ serviceType: 'flight', quantity: 1, unitPriceSAR: 100 }],
      subtotalHalalas: 10_000, vatHalalas: 1_500, grandTotalHalalas: 99,
    })).toThrow(/الإجمالي/);
  });

  it('يعيد الحقول المخزنة إلى الصيغة التي تعرضها الشاشة', () => {
    const shown = presentQuote({
      id: 'q1', agencyId: 'a1', quoteNumber: 'QT-1', customerName: 'عميل', customerNameEn: null,
      customerPhone: null, customerEmail: null, items: [], subtotalHalalas: 10_000,
      vatHalalas: 1_500, totalHalalas: 11_500, status: 'approved', issueDate: '2026-08-01',
      validUntil: '2026-08-08', notes: null, terms: null, convertedToBookingId: null,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    expect(shown).toMatchObject({
      customerNameAr: 'عميل', customerNameEn: 'عميل', status: 'accepted',
      grandTotalHalalas: 11_500, vatHalalas: 1_500,
    });
  });

  it('يطابق الضريبة مع حالة تسجيل الوكالة ومعدلها', () => {
    expect(() => validateQuoteTax(
      { subtotalHalalas: 10_000, vatHalalas: 1_500, totalHalalas: 11_500 },
      { isVatRegistered: true, vatRate: 15 },
    )).not.toThrow();
    expect(() => validateQuoteTax(
      { subtotalHalalas: 10_000, vatHalalas: 1_500, totalHalalas: 11_500 },
      { isVatRegistered: false, vatRate: 15 },
    )).toThrow(/إعدادات الوكالة/);
  });
});
