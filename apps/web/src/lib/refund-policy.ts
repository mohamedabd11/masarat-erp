import { BusinessError } from './api-auth';

const REFUNDABLE_INVOICE_TYPES = new Set(['380', '388']);
const REFUNDABLE_INVOICE_STATUSES = new Set(['issued', 'partial', 'paid']);

export interface RefundPolicyInput {
  bookingId:                    string;
  invoiceBookingId:             string | null;
  invoiceType:                  string;
  invoiceStatus:                string;
  originalTotalHalalas:         number;
  paidHalalas:                  number;
  /** Net credit notes already issued against the original invoice. */
  creditedHalalas:              number;
  /** Gross original supply already unwound, before retained fees. */
  cancelledHalalas:             number;
  refundAmountHalalas:          number;
  cancellationFeeHalalas:       number;
  requestedCancelledTotalHalalas?: number;
}

export interface RefundPolicyResult {
  /** Paid value consumed by this operation: cash returned + retained fee. */
  claimedPaidHalalas:   number;
  /** Total invoiced value whose revenue/cost/AR is being unwound. */
  cancelledTotalHalalas: number;
  /** Credit-note value: cancelled supply less the retained cancellation fee. */
  creditNoteTotalHalalas: number;
  /** True only when the whole original invoice is being cancelled. */
  isFullCancellation:   boolean;
  /** Remaining collected amount after returning cash; retained fees stay paid. */
  newPaidHalalas:        number;
  /** Net cumulative credit notes after this operation. */
  newCreditedHalalas:    number;
  /** Gross cumulative original supply unwound after this operation. */
  newCancelledHalalas:   number;
  /** Collectible balance after applying payment and credit-note movements. */
  newOutstandingHalalas: number;
}

/**
 * Validate the invoice/booking lifecycle before any refund rows are written.
 *
 * Keeping this policy pure makes the high-risk rules independently testable;
 * the route still repeats the paid-balance condition atomically in its UPDATE
 * to protect against concurrent refunds.
 */
export function validateRefundPolicy(input: RefundPolicyInput): RefundPolicyResult {
  if (input.invoiceBookingId !== input.bookingId) {
    throw new BusinessError('الفاتورة لا تنتمي لهذا الحجز', 400);
  }
  if (!REFUNDABLE_INVOICE_TYPES.has(input.invoiceType)) {
    throw new BusinessError('لا يمكن تنفيذ استرداد على إشعار دائن أو مدين', 400);
  }
  if (!REFUNDABLE_INVOICE_STATUSES.has(input.invoiceStatus)) {
    throw new BusinessError('حالة الفاتورة لا تسمح بالاسترداد', 400);
  }
  if (!Number.isInteger(input.originalTotalHalalas) || input.originalTotalHalalas <= 0) {
    throw new BusinessError('إجمالي الفاتورة غير صالح للاسترداد', 400);
  }
  if (!Number.isInteger(input.paidHalalas) || input.paidHalalas < 0
      || !Number.isInteger(input.creditedHalalas) || input.creditedHalalas < 0
      || !Number.isInteger(input.cancelledHalalas) || input.cancelledHalalas < 0) {
    throw new BusinessError('أرصدة الفاتورة غير صالحة للاسترداد', 422);
  }

  const claimedPaidHalalas = input.refundAmountHalalas + input.cancellationFeeHalalas;
  if (claimedPaidHalalas > input.paidHalalas) {
    throw new BusinessError(
      `المجموع (${claimedPaidHalalas / 100} ر.س) يتجاوز المدفوع (${input.paidHalalas / 100} ر.س)`,
      400,
    );
  }

  const cancelledTotalHalalas = input.requestedCancelledTotalHalalas ?? claimedPaidHalalas;
  if (cancelledTotalHalalas < claimedPaidHalalas) {
    throw new BusinessError('قيمة الجزء الملغى أقل من الاسترداد ورسوم الإلغاء', 400);
  }
  if (cancelledTotalHalalas > input.originalTotalHalalas) {
    throw new BusinessError('قيمة الجزء الملغى تتجاوز إجمالي الفاتورة', 400);
  }

  const creditNoteTotalHalalas = cancelledTotalHalalas - input.cancellationFeeHalalas;
  const newCancelledHalalas = input.cancelledHalalas + cancelledTotalHalalas;
  if (newCancelledHalalas > input.originalTotalHalalas) {
    throw new BusinessError('إجمالي الجزء الملغى يتجاوز قيمة الفاتورة الأصلية', 422);
  }

  const newCreditedHalalas = input.creditedHalalas + creditNoteTotalHalalas;
  if (newCreditedHalalas > input.originalTotalHalalas) {
    throw new BusinessError('إجمالي الإشعارات الدائنة يتجاوز قيمة الفاتورة الأصلية', 422);
  }

  // Returning cash reduces the collected balance. A declared cancellation fee
  // remains collected against the net invoice; subtracting it as well would make
  // the subledger disagree with the refund journal. This invariant also rejects
  // a full cancellation that silently retains customer cash without declaring it
  // as a fee.
  const newPaidHalalas = input.paidHalalas - input.refundAmountHalalas;
  const newOutstandingHalalas = input.originalTotalHalalas - newPaidHalalas - newCreditedHalalas;
  if (newOutstandingHalalas < 0) {
    throw new BusinessError('ينتج عن العملية رصيد مدفوع غير مبرر؛ سجّل المبلغ المحتفظ به كرسوم إلغاء', 422);
  }

  return {
    claimedPaidHalalas,
    cancelledTotalHalalas,
    creditNoteTotalHalalas,
    isFullCancellation: newCancelledHalalas === input.originalTotalHalalas,
    newPaidHalalas,
    newCreditedHalalas,
    newCancelledHalalas,
    newOutstandingHalalas,
  };
}
