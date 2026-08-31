import { describe, expect, it } from 'vitest';
import { calculateBookingPricing } from '@/lib/booking-pricing';

describe('calculateBookingPricing', () => {
  it('uses supplier cost plus agency fee as the selling price in agent mode', () => {
    expect(calculateBookingPricing({
      revenueModel: 'agent',
      supplierCostSAR: 1_000,
      sellingPriceSAR: 9_999,
      serviceFeeSAR: 100,
      isVatRegistered: true,
      vatRatePercent: 15,
    })).toEqual({
      supplierCostSAR: 1_000,
      sellingPriceSAR: 1_100,
      serviceFeeSAR: 100,
      vatSAR: 15,
      totalSAR: 1_115,
    });
  });

  it('keeps supplier cost separate from the selling price in principal mode', () => {
    expect(calculateBookingPricing({
      revenueModel: 'principal',
      supplierCostSAR: 700,
      sellingPriceSAR: 1_150,
      serviceFeeSAR: 0,
      isVatRegistered: false,
      vatRatePercent: 15,
    })).toEqual({
      supplierCostSAR: 700,
      sellingPriceSAR: 1_150,
      serviceFeeSAR: 0,
      vatSAR: 0,
      totalSAR: 1_150,
    });
  });
});
