import { describe, expect, it } from 'vitest';
import { validateRefundPolicy } from '@/lib/refund-policy';

const base = {
  bookingId: 'booking-1',
  invoiceBookingId: 'booking-1',
  invoiceType: '388',
  invoiceStatus: 'paid',
  originalTotalHalalas: 11_500_00,
  paidHalalas: 11_500_00,
  refundAmountHalalas: 11_000_00,
  cancellationFeeHalalas: 500_00,
};

describe('validateRefundPolicy', () => {
  it('counts a retained cancellation fee as consumed paid value', () => {
    const result = validateRefundPolicy(base);

    expect(result.claimedPaidHalalas).toBe(11_500_00);
    expect(result.isFullCancellation).toBe(true);
  });

  it('recognises a full cancellation of a partially-paid invoice', () => {
    const result = validateRefundPolicy({
      ...base,
      paidHalalas: 5_750_00,
      refundAmountHalalas: 5_250_00,
      cancellationFeeHalalas: 500_00,
      requestedCancelledTotalHalalas: 11_500_00,
      invoiceStatus: 'partial',
    });

    expect(result.claimedPaidHalalas).toBe(5_750_00);
    expect(result.cancelledTotalHalalas).toBe(11_500_00);
    expect(result.creditNoteTotalHalalas).toBe(11_000_00);
    expect(result.isFullCancellation).toBe(true);
  });

  it('does not treat exhausting a partial payment as cancelling the whole invoice', () => {
    const result = validateRefundPolicy({
      ...base,
      paidHalalas: 5_750_00,
      refundAmountHalalas: 5_750_00,
      cancellationFeeHalalas: 0,
      invoiceStatus: 'partial',
    });

    expect(result.cancelledTotalHalalas).toBe(5_750_00);
    expect(result.isFullCancellation).toBe(false);
  });

  it('rejects an invoice that belongs to another booking', () => {
    expect(() => validateRefundPolicy({ ...base, invoiceBookingId: 'booking-2' }))
      .toThrow(/لا تنتمي/);
  });

  it('rejects refunding a credit note', () => {
    expect(() => validateRefundPolicy({ ...base, invoiceType: '381' }))
      .toThrow(/إشعار دائن أو مدين/);
  });

  it('rejects cancelling more than the original invoice total', () => {
    expect(() => validateRefundPolicy({
      ...base,
      requestedCancelledTotalHalalas: 11_500_01,
    })).toThrow(/تتجاوز إجمالي الفاتورة/);
  });
});
