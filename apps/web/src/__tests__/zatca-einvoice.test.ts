/**
 * ZATCA e-invoice record builder — unit tests.
 *
 * Covers the pure half of the pipeline: genesis PIH constant, B2B/B2C
 * classification, totals-reconciliation guards, line fallback behaviour,
 * Phase 1 QR TLV correctness, and the UBL subtype-code mapping.
 *
 * Network and DB paths (prepare/submit) are not exercised here — they are
 * integration concerns gated on production onboarding.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';

vi.mock('@/lib/db', () => ({ db: {} }));

import { ZATCA_GENESIS_PIH, buildZatcaInvoiceRecord, inferZatcaExemptionReason, parseStoredInvoiceItems } from '@/lib/zatca-einvoice';
import { buildInvoiceXml } from '@masarat/zatca';

const BASE = {
  uuid:           '8e6a3c4b-0000-4000-8000-000000000001',
  invoiceNumber:  'INV-2026-000123',
  issueDateTime:  new Date('2026-06-10T09:00:00Z'),
  sellerNameAr:   'وكالة مسارات للسفر',
  vatNumber:      '300000000000003',
  buyerName:      'عميل اختبار',
  vatRatePercent: 15,
};

const AMOUNTS = { subtotalHalalas: 100_000, vatHalalas: 15_000, totalHalalas: 115_000 };

/** Decodes a base64 TLV QR back into tag → value map */
function decodeTlv(b64: string): Map<number, string> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const out = new Map<number, string>();
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i]!, len = bytes[i + 1]!;
    out.set(tag, new TextDecoder().decode(bytes.slice(i + 2, i + 2 + len)));
    i += 2 + len;
  }
  return out;
}

describe('ZATCA_GENESIS_PIH', () => {
  it('يطابق base64(hex(sha256("0"))) وفق اصطلاح ZATCA SDK', () => {
    const expected = Buffer.from(
      createHash('sha256').update('0').digest('hex'), 'utf8',
    ).toString('base64');
    expect(ZATCA_GENESIS_PIH).toBe(expected);
  });
});

describe('buildZatcaInvoiceRecord — التصنيف', () => {
  it('B2C (مبسطة) عند غياب الرقم الضريبي للمشتري', () => {
    const rec = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS });
    expect(rec.transactionType).toBe('B2C');
    expect(rec.uuid).toBe(BASE.uuid);
  });

  it('B2B (قياسية) عند وجود رقم ضريبي للمشتري', () => {
    const rec = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS, buyerVatNumber: '311111111111113' });
    expect(rec.transactionType).toBe('B2B');
    expect(rec.invoice.buyer.vatNumber).toBe('311111111111113');
  });

  it('نوع الفاتورة الافتراضي 388 مع إمكانية التجاوز للإشعارات', () => {
    expect(buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS }).invoice.invoiceTypeCode).toBe('388');
    expect(
      buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS, invoiceTypeCode: '381' }).invoice.invoiceTypeCode,
    ).toBe('381');
  });
});

describe('buildZatcaInvoiceRecord — حراسة الإجماليات', () => {
  it('يرفض إجماليات غير متوازنة (subtotal + vat ≠ total)', () => {
    expect(() => buildZatcaInvoiceRecord({
      ...BASE, subtotalHalalas: 100_000, vatHalalas: 15_000, totalHalalas: 114_999,
    })).toThrow(/reconcile/);
  });

  it('يرفض غياب الرقم الضريبي للبائع', () => {
    expect(() => buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS, vatNumber: ' ' })).toThrow(/VAT number/);
  });

  it('يرفض المبالغ السالبة', () => {
    expect(() => buildZatcaInvoiceRecord({
      ...BASE, subtotalHalalas: -100, vatHalalas: 0, totalHalalas: -100,
    })).toThrow(/non-negative/);
  });
});

describe('buildZatcaInvoiceRecord — البنود', () => {
  it('بند واحد مجمّع عند غياب البنود التفصيلية', () => {
    const rec = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS });
    expect(rec.invoice.lines).toHaveLength(1);
    expect(rec.invoice.lines[0]!.totalPriceExclVat).toBe(100_000);
    expect(rec.invoice.lines[0]!.vatAmount).toBe(15_000);
    expect(rec.invoice.lines[0]!.vatCategory).toBe('S');
  });

  it('يحافظ على البنود التفصيلية عندما تُطابق الإجماليات', () => {
    const rec = buildZatcaInvoiceRecord({
      ...BASE, ...AMOUNTS,
      items: [
        { description: 'تذكرة طيران', quantity: 1, unitPriceHalalas: 60_000, vatHalalas: 9_000,  totalHalalas: 69_000 },
        { description: 'إقامة فندق',  quantity: 2, unitPriceHalalas: 20_000, vatHalalas: 6_000,  totalHalalas: 46_000 },
      ],
    });
    expect(rec.invoice.lines).toHaveLength(2);
    expect(rec.invoice.lines[0]!.name).toBe('تذكرة طيران');
    expect(rec.invoice.lines[1]!.totalPriceExclVat).toBe(40_000);
    expect(rec.invoice.totals.vatBreakdown).toEqual([
      { category: 'S', taxableAmount: 100_000, vatAmount: 15_000 },
    ]);
  });

  it('يتراجع لبند مجمّع واحد عندما لا تُطابق البنود الإجماليات', () => {
    const rec = buildZatcaInvoiceRecord({
      ...BASE, ...AMOUNTS,
      items: [{ description: 'بند ناقص', quantity: 1, unitPriceHalalas: 10_000, vatHalalas: 1_500, totalHalalas: 11_500 }],
    });
    expect(rec.invoice.lines).toHaveLength(1);
    expect(rec.invoice.lines[0]!.totalPriceExclVat).toBe(100_000);
  });

  it('تصنيف Z (نسبة صفرية) عند انعدام الضريبة', () => {
    const rec = buildZatcaInvoiceRecord({
      ...BASE, subtotalHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000,
    });
    expect(rec.invoice.lines[0]!.vatCategory).toBe('Z');
    expect(rec.invoice.lines[0]!.vatRate).toBe(0);
    expect(rec.invoice.totals.vatBreakdown).toEqual([
      { category: 'Z', taxableAmount: 100_000, vatAmount: 0 },
    ]);
  });
});

describe('buildZatcaInvoiceRecord — رمز QR (TLV)', () => {
  it('يولّد TLV سليماً ببيانات البائع والمبالغ', () => {
    const rec = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS });
    const tlv = decodeTlv(rec.qr);
    expect(tlv.get(1)).toBe(BASE.sellerNameAr);
    expect(tlv.get(2)).toBe(BASE.vatNumber);
    expect(tlv.get(3)).toContain('2026-06-10T');
    expect(tlv.get(4)).toBe('1150.00');
    expect(tlv.get(5)).toBe('150.00');
  });
});

describe('buildInvoiceXml — أكواد النوع الفرعي (BR-KSA-06)', () => {
  it('B2B ⇒ قياسية 0100000 / B2C ⇒ مبسطة 0200000', () => {
    const b2b = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS, buyerVatNumber: '311111111111113' });
    const b2c = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS });
    expect(buildInvoiceXml(b2b.invoice, ZATCA_GENESIS_PIH)).toContain('name="0100000">388<');
    expect(buildInvoiceXml(b2c.invoice, ZATCA_GENESIS_PIH)).toContain('name="0200000">388<');
  });

  it('يستخدم ICV الصريح عند تمريره بدلاً من المستخرج من رقم الفاتورة', () => {
    const rec = buildZatcaInvoiceRecord({ ...BASE, ...AMOUNTS });
    const xml = buildInvoiceXml(rec.invoice, ZATCA_GENESIS_PIH, 4217);
    expect(xml).toContain('<cbc:UUID>4217</cbc:UUID>');
    expect(xml).toContain(`<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${ZATCA_GENESIS_PIH}</cbc:EmbeddedDocumentBinaryObject>`);
  });
});

describe('inferZatcaExemptionReason — أكواد إعفاء VATEX للسطور صفرية النسبة', () => {
  it('طيران دولي ⇒ VATEX-SA-32', () => {
    expect(inferZatcaExemptionReason('Z', 'flight', null, true)).toBe('VATEX-SA-32');
    expect(inferZatcaExemptionReason('Z', 'flights', null, true)).toBe('VATEX-SA-32');
  });

  it('طيران محلي صفري النسبة بلا سبب إعفاء محدد', () => {
    expect(inferZatcaExemptionReason('Z', 'flight', null, false)).toBeUndefined();
  });

  it('عمرة/حج ⇒ VATEX-SA-34-1 (من نوع الحجز عند غياب نوع السطر)', () => {
    expect(inferZatcaExemptionReason('Z', null, 'umrah', false)).toBe('VATEX-SA-34-1');
    expect(inferZatcaExemptionReason('Z', null, 'hajj', false)).toBe('VATEX-SA-34-1');
  });

  it('فئة قياسية (S) لا تحتاج سبب إعفاء حتى لو كانت دولية', () => {
    expect(inferZatcaExemptionReason('S', 'flight', null, true)).toBeUndefined();
  });
});

describe('buildZatcaInvoiceRecord — أكواد إعفاء VATEX على مستوى البند والإجمالي', () => {
  it('يضع كود الإعفاء على البند وعلى vatBreakdown لسطر طيران دولي صفري', () => {
    const rec = buildZatcaInvoiceRecord({
      ...BASE,
      subtotalHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000,
      items: [{
        description: 'تذكرة طيران دولي', quantity: 1,
        unitPriceHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000,
        vatCategory: 'Z', exemptionReason: 'VATEX-SA-32',
      }],
    });
    expect(rec.invoice.lines[0]!.vatCategory).toBe('Z');
    expect(rec.invoice.lines[0]!.exemptionReason).toBe('VATEX-SA-32');
    expect(rec.invoice.totals.vatBreakdown).toEqual([
      { category: 'Z', taxableAmount: 100_000, vatAmount: 0, exemptionReason: 'VATEX-SA-32' },
    ]);
  });

  it('فاتورة مختلطة: سطر فندق قياسي (S) + سطر طيران دولي صفري (Z/VATEX-SA-32) ينتجان TaxSubtotal منفصلين', () => {
    const rec = buildZatcaInvoiceRecord({
      ...BASE,
      subtotalHalalas: 100_000, vatHalalas: 9_000, totalHalalas: 109_000,
      items: [
        { description: 'تذكرة طيران دولي', quantity: 1, unitPriceHalalas: 40_000, vatHalalas: 0,     totalHalalas: 40_000, vatCategory: 'Z', exemptionReason: 'VATEX-SA-32' },
        { description: 'إقامة فندق',       quantity: 1, unitPriceHalalas: 60_000, vatHalalas: 9_000, totalHalalas: 69_000, vatCategory: 'S' },
      ],
    });
    expect(rec.invoice.totals.vatBreakdown).toEqual([
      { category: 'S', taxableAmount: 60_000, vatAmount: 9_000 },
      { category: 'Z', taxableAmount: 40_000, vatAmount: 0, exemptionReason: 'VATEX-SA-32' },
    ]);
  });

  it('يحافظ على التوافق مع البنود القديمة بلا vatCategory/exemptionReason (تصنيف بالاستدلال من vatHalalas)', () => {
    const rec = buildZatcaInvoiceRecord({
      ...BASE, ...AMOUNTS,
      items: [
        { description: 'تذكرة طيران', quantity: 1, unitPriceHalalas: 60_000, vatHalalas: 9_000,  totalHalalas: 69_000 },
        { description: 'إقامة فندق',  quantity: 2, unitPriceHalalas: 20_000, vatHalalas: 6_000,  totalHalalas: 46_000 },
      ],
    });
    expect(rec.invoice.lines[0]!.vatCategory).toBe('S');
    expect(rec.invoice.lines[0]!.exemptionReason).toBeUndefined();
  });
});

describe('parseStoredInvoiceItems — يحافظ على vatCategory/exemptionReason المخزَّنين', () => {
  it('يستخرج vatCategory وexemptionReason عند وجودهما في JSON المخزَّن', () => {
    const items = parseStoredInvoiceItems([
      { description: 'تذكرة عمرة', quantity: 1, unitPriceHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000, vatCategory: 'Z', exemptionReason: 'VATEX-SA-34-1' },
    ]);
    expect(items).toEqual([
      { description: 'تذكرة عمرة', quantity: 1, unitPriceHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000, vatCategory: 'Z', exemptionReason: 'VATEX-SA-34-1' },
    ]);
  });

  it('يتجاهل vatCategory/exemptionReason غير الصالحين بإعادة undefined', () => {
    const items = parseStoredInvoiceItems([
      { description: 'بند', quantity: 1, unitPriceHalalas: 100_000, vatHalalas: 15_000, totalHalalas: 115_000 },
    ]);
    expect(items![0]!.vatCategory).toBeUndefined();
    expect(items![0]!.exemptionReason).toBeUndefined();
  });
});
