export interface VatControlTotals {
  outputDebit: number;
  outputCredit: number;
  inputDebit: number;
  inputCredit: number;
}

export interface VatControlMovements {
  outputVat: number;
  inputVat: number;
  netVatPayable: number;
}

/**
 * Calculate the period movement of the two VAT control accounts.
 *
 * Output VAT (2200) is credit-normal; Input VAT (1230) is debit-normal. Credits
 * to 1230 are reversals and must reduce the reclaimable amount rather than being
 * ignored.
 */
export function calculateVatControlMovements(totals: VatControlTotals): VatControlMovements {
  const outputVat = Number(totals.outputCredit) - Number(totals.outputDebit);
  const inputVat = Number(totals.inputDebit) - Number(totals.inputCredit);
  return { outputVat, inputVat, netVatPayable: outputVat - inputVat };
}
