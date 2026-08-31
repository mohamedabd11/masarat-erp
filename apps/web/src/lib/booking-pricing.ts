export interface BookingPricingInput {
  revenueModel: 'agent' | 'principal';
  supplierCostSAR: number;
  sellingPriceSAR: number;
  serviceFeeSAR: number;
  isVatRegistered: boolean;
  vatRatePercent: number;
}

export interface BookingPricingResult {
  supplierCostSAR: number;
  sellingPriceSAR: number;
  serviceFeeSAR: number;
  vatSAR: number;
  totalSAR: number;
}

/**
 * Keep supplier cost and customer selling price separate.
 *
 * In the agent model the customer price is supplier cost + agency fee. In the
 * principal model the selling price is entered independently; treating it as
 * supplier cost would post an artificial payable and erase the booking profit.
 */
export function calculateBookingPricing(input: BookingPricingInput): BookingPricingResult {
  const supplierCostSAR = Math.max(0, Number(input.supplierCostSAR) || 0);
  const serviceFeeSAR   = Math.max(0, Number(input.serviceFeeSAR)   || 0);
  const explicitSale    = Math.max(0, Number(input.sellingPriceSAR) || 0);
  const sellingPriceSAR = input.revenueModel === 'agent'
    ? supplierCostSAR + serviceFeeSAR
    : explicitSale;
  const vatBaseSAR = input.revenueModel === 'agent' ? serviceFeeSAR : sellingPriceSAR;
  const vatSAR = input.isVatRegistered
    ? Math.round(vatBaseSAR * Math.max(0, input.vatRatePercent)) / 100
    : 0;

  return {
    supplierCostSAR,
    sellingPriceSAR,
    serviceFeeSAR,
    vatSAR,
    totalSAR: sellingPriceSAR + vatSAR,
  };
}
