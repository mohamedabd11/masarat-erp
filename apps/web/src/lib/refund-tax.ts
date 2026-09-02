import { BusinessError } from './api-auth';

export interface RefundTaxInput {
  originalTotalHalalas:   number;
  originalVatHalalas:     number;
  cancelledTotalHalalas:  number;
  cancellationFeeHalalas: number;
  isEInvoice:             boolean;
  /** Statutory VAT rate captured on the booking line: 1500 = 15%. */
  vatRateBps:             number;
}

export interface RefundTaxResult {
  /** VAT contained in the retained, VAT-inclusive cancellation fee. */
  cancellationFeeVatHalalas: number;
  /** Net revenue represented by the retained cancellation fee. */
  cancellationFeeNetHalalas: number;
  /** VAT on the cancelled original supply before retaining the fee. */
  cancelledOriginalVatHalalas: number;
  /** VAT carried by the credit note and reversed from VAT payable. */
  creditNoteVatHalalas: number;
  creditNoteSubtotalHalalas: number;
  creditNoteTotalHalalas: number;
}

/**
 * Calculate the tax split for a refund document.
 *
 * The cancellation fee is a new VAT-inclusive taxable supply. Its VAT must be
 * extracted with the statutory rate (gross × rate / (100% + rate)), not with
 * the original invoice's effective VAT ratio. The latter is wrong for agent
 * invoices because the supplier pass-through is outside the agency's VAT base.
 */
export function calculateRefundTax(input: RefundTaxInput): RefundTaxResult {
  const {
    originalTotalHalalas,
    originalVatHalalas,
    cancelledTotalHalalas,
    cancellationFeeHalalas,
    isEInvoice,
    vatRateBps,
  } = input;

  if (!Number.isInteger(originalTotalHalalas) || originalTotalHalalas <= 0) {
    throw new BusinessError('إجمالي الفاتورة غير صالح للاسترداد', 400);
  }
  if (!Number.isInteger(originalVatHalalas) || originalVatHalalas < 0
      || !Number.isInteger(cancelledTotalHalalas) || cancelledTotalHalalas < 0
      || !Number.isInteger(cancellationFeeHalalas) || cancellationFeeHalalas < 0
      || cancellationFeeHalalas > cancelledTotalHalalas) {
    throw new BusinessError('قيم ضريبة الاسترداد غير صالحة', 400);
  }
  if (!Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10_000) {
    throw new BusinessError('معدل ضريبة الاسترداد غير صالح', 400);
  }

  const cancelledOriginalVatHalalas = isEInvoice
    ? Math.round(originalVatHalalas * cancelledTotalHalalas / originalTotalHalalas)
    : 0;

  if (isEInvoice && cancellationFeeHalalas > 0 && vatRateBps <= 0) {
    throw new BusinessError('لا يمكن احتساب ضريبة رسوم الإلغاء دون معدل ضريبي صالح', 422);
  }

  const cancellationFeeVatHalalas = isEInvoice
    ? Math.round(cancellationFeeHalalas * vatRateBps / (10_000 + vatRateBps))
    : 0;
  const cancellationFeeNetHalalas = cancellationFeeHalalas - cancellationFeeVatHalalas;

  // A single net credit note can only carry non-negative VAT. If the retained
  // taxable fee contains more VAT than the cancelled original lines, the proper
  // representation requires a separate fee invoice/debit note instead.
  if (cancellationFeeVatHalalas > cancelledOriginalVatHalalas) {
    throw new BusinessError(
      'رسوم الإلغاء تتجاوز الجزء الخاضع للضريبة في الإلغاء؛ يلزم إصدار فاتورة مستقلة للرسوم',
      422,
    );
  }

  const creditNoteTotalHalalas = cancelledTotalHalalas - cancellationFeeHalalas;
  const creditNoteVatHalalas = cancelledOriginalVatHalalas - cancellationFeeVatHalalas;
  const creditNoteSubtotalHalalas = creditNoteTotalHalalas - creditNoteVatHalalas;

  if (creditNoteSubtotalHalalas < 0) {
    throw new BusinessError('قيمة الإشعار الدائن قبل الضريبة غير صالحة', 422);
  }

  return {
    cancellationFeeVatHalalas,
    cancellationFeeNetHalalas,
    cancelledOriginalVatHalalas,
    creditNoteVatHalalas,
    creditNoteSubtotalHalalas,
    creditNoteTotalHalalas,
  };
}
