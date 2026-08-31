import { describe, expect, it } from 'vitest';
import { buildRefundDocument } from '@/lib/refund-document';
import type { ZatcaRecordItem } from '@/lib/zatca-einvoice';

const agentItems: ZatcaRecordItem[] = [
  {
    description: 'تذكرة — مبلغ المورد', quantity: 1,
    unitPriceHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000,
    vatCategory: 'O',
  },
  {
    description: 'تذكرة — رسوم الوكالة', quantity: 1,
    unitPriceHalalas: 10_000, vatHalalas: 1_500, totalHalalas: 11_500,
    vatCategory: 'S',
  },
];

describe('buildRefundDocument', () => {
  it('extracts cancellation-fee VAT at the statutory rate for an agent invoice', () => {
    const result = buildRefundDocument({
      originalItems: agentItems,
      originalTotalHalalas: 111_500,
      originalVatHalalas: 1_500,
      cancelledTotalHalalas: 111_500,
      cancellationFeeHalalas: 10_000,
      isEInvoice: true,
      vatRateBps: 1_500,
    });

    expect(result.cancellationFeeNetHalalas).toBe(8_696);
    expect(result.cancellationFeeVatHalalas).toBe(1_304);
    expect(result.creditNoteSubtotalHalalas).toBe(101_304);
    expect(result.creditNoteVatHalalas).toBe(196);
    expect(result.creditNoteTotalHalalas).toBe(101_500);
    expect(result.items).toEqual([
      expect.objectContaining({ vatCategory: 'O', unitPriceHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000 }),
      expect.objectContaining({ vatCategory: 'S', unitPriceHalalas: 1_304, vatHalalas: 196, totalHalalas: 1_500 }),
    ]);
  });

  it('preserves exact item and document totals for a partial agent cancellation', () => {
    const result = buildRefundDocument({
      originalItems: agentItems,
      originalTotalHalalas: 111_500,
      originalVatHalalas: 1_500,
      cancelledTotalHalalas: 55_750,
      cancellationFeeHalalas: 5_000,
      isEInvoice: true,
      vatRateBps: 1_500,
    });

    expect(result.creditNoteTotalHalalas).toBe(50_750);
    expect(result.creditNoteVatHalalas).toBe(98);
    expect(result.items?.reduce((sum, item) => sum + item.totalHalalas, 0)).toBe(50_750);
    expect(result.items?.reduce((sum, item) => sum + item.vatHalalas, 0)).toBe(98);
  });

  it('keeps principal-invoice arithmetic compatible with the statutory split', () => {
    const result = buildRefundDocument({
      originalItems: [{
        description: 'خدمة', quantity: 1, unitPriceHalalas: 100_000,
        vatHalalas: 15_000, totalHalalas: 115_000, vatCategory: 'S',
      }],
      originalTotalHalalas: 115_000,
      originalVatHalalas: 15_000,
      cancelledTotalHalalas: 115_000,
      cancellationFeeHalalas: 10_000,
      isEInvoice: true,
      vatRateBps: 1_500,
    });

    expect(result.creditNoteTotalHalalas).toBe(105_000);
    expect(result.creditNoteVatHalalas).toBe(13_696);
    expect(result.creditNoteSubtotalHalalas).toBe(91_304);
  });

  it('rejects an old aggregate agent line whose advertised rate does not match its VAT', () => {
    expect(() => buildRefundDocument({
      originalItems: [{
        description: 'تذكرة', quantity: 1, unitPriceHalalas: 110_000,
        vatHalalas: 1_500, totalHalalas: 111_500, vatCategory: 'S',
      }],
      originalTotalHalalas: 111_500,
      originalVatHalalas: 1_500,
      cancelledTotalHalalas: 111_500,
      cancellationFeeHalalas: 10_000,
      isEInvoice: true,
      vatRateBps: 1_500,
    })).toThrow(/لا يوضح مبلغ المورد ورسوم الوكالة/);
  });

  it('rejects a net credit note when the fee VAT exceeds cancelled VAT', () => {
    expect(() => buildRefundDocument({
      originalItems: agentItems,
      originalTotalHalalas: 111_500,
      originalVatHalalas: 1_500,
      cancelledTotalHalalas: 111_500,
      cancellationFeeHalalas: 12_000,
      isEInvoice: true,
      vatRateBps: 1_500,
    })).toThrow(/فاتورة مستقلة للرسوم/);
  });
});
