/**
 * Refund journal builder (CRIT-10).
 *
 * Builds the balanced double-entry GL lines for a refund / cancellation by
 * READING THE ORIGINAL INVOICE'S JOURNAL LINES and reversing each one pro-rated
 * by the cancelled portion — the same approach `invoices/credit-note/route.ts`
 * uses. This replaces the old model that derived a single revenue account from
 * `booking.details.revenueModel` and reversed COGS from the stale
 * `booking.costPriceHalalas` aggregate.
 *
 * Correctly handles:
 *   1. Mixed bookings — reverses EVERY original revenue line (4000 agent fee AND
 *      4100 principal revenue), not one model-derived account.
 *   2. Cost — reverses the original COGS (Dr 5000 → Cr 5000) and AP (Cr 2000 →
 *      Dr 2000) lines pro-rated, instead of the legacy aggregate.
 *   3. Deferred revenue — if the original credited 3201 (revenue not yet
 *      recognised), the reversal debits 3201 automatically (the original simply
 *      has no 4000/4100 credit to find).
 *   4. Partial payment — splits the credit between Bank (cash actually returned)
 *      and AR 1120 (the still-open unpaid portion being voided). Cancellation-fee
 *      revenue (4200) is only recognised against retained cash.
 *
 * Pure function: no DB / IO. The route reads the original lines and calls this.
 */
import { GL } from './gl-accounts';
import { BusinessError } from './api-auth';
import { calculateRefundTax } from './refund-tax';

export interface OriginalJournalLine {
  accountCode:   string;
  accountNameAr: string | null;
  accountNameEn: string | null;
  debitHalalas:  number;
  creditHalalas: number;
}

export interface RefundJournalInput {
  /** The original invoice's posted journal lines. Empty → legacy fallback. */
  originalLines:          OriginalJournalLine[];
  /** Original invoice total (VAT-inclusive), in halalas. */
  originalTotalHalalas:   number;
  /** Original invoice VAT, in halalas. */
  originalVatHalalas:     number;
  /** Amount already collected against the original invoice, in halalas. */
  paidHalalas:            number;
  /** Cash actually returned to the customer, in halalas. */
  refundAmountHalalas:    number;
  /** Cancellation fee retained by the agency (VAT-inclusive), in halalas. */
  cancellationFeeHalalas: number;
  /**
   * Total invoiced value being cancelled/unwound (VAT-inclusive), in halalas.
   * Defaults to `refundAmount + cancellationFee`. Pass a larger value to also
   * void the still-open (unpaid) AR for the cancelled portion.
   */
  cancelledTotalHalalas?: number;
  /** Whether the original invoice is a VAT e-invoice (drives fee VAT). */
  isEInvoice:             boolean;
  /** Statutory VAT rate captured on the booking line: 1500 = 15%. */
  vatRateBps?:            number;
  /** Used ONLY when `originalLines` is empty (legacy invoices with no journal). */
  fallback?: { revenueModel: 'agent' | 'principal'; costPriceHalalas: number };
}

export interface RefundJournalLine {
  code: string;
  ar:   string;
  en:   string;
  dr:   number;
  cr:   number;
}

/** Max halala drift (from independent per-line rounding) absorbed silently. */
const MAX_ROUNDING_HALALAS = 5;

const isRevenueOrDeferred = (code: string) => code.startsWith('4') || code === '3201';

/**
 * Build the balanced refund journal lines. Postcondition: Σdr === Σcr.
 * Throws BusinessError on an over-refund (negative AR void) or an imbalance that
 * exceeds the rounding tolerance.
 */
export function buildRefundJournalLines(input: RefundJournalInput): RefundJournalLine[] {
  const {
    originalLines, originalTotalHalalas, originalVatHalalas, paidHalalas,
    refundAmountHalalas, cancellationFeeHalalas, isEInvoice,
  } = input;

  const denom          = originalTotalHalalas > 0 ? originalTotalHalalas : 1;
  const cancelledTotal = input.cancelledTotalHalalas ?? (refundAmountHalalas + cancellationFeeHalalas);
  const reversalRatio  = cancelledTotal / denom;

  if (!Number.isInteger(originalTotalHalalas) || originalTotalHalalas <= 0) {
    throw new BusinessError('إجمالي الفاتورة غير صالح للاسترداد', 400);
  }
  if (cancelledTotal > originalTotalHalalas) {
    throw new BusinessError('قيمة الجزء الملغى تتجاوز إجمالي الفاتورة', 400);
  }
  if (refundAmountHalalas + cancellationFeeHalalas > paidHalalas) {
    throw new BusinessError('مبلغ الاسترداد ورسوم الإلغاء يتجاوزان المبلغ المدفوع', 400);
  }

  // VAT on a retained cancellation fee is extracted using the statutory rate,
  // not the invoice-wide effective ratio. This matters for agent invoices where
  // the supplier pass-through is outside the agency's VAT base.
  const refundTax = calculateRefundTax({
    originalTotalHalalas,
    originalVatHalalas,
    cancelledTotalHalalas: cancelledTotal,
    cancellationFeeHalalas,
    isEInvoice,
    vatRateBps: input.vatRateBps ?? (isEInvoice ? 1500 : 0),
  });
  const cancelFeeNet = refundTax.cancellationFeeNetHalalas;
  const vatRev = refundTax.creditNoteVatHalalas;

  // Open (unpaid) AR being written off = cancelled value minus the cash returned
  // and the retained fee. Zero in the common case (cancel only what was paid).
  const arVoid = cancelledTotal - refundAmountHalalas - cancellationFeeHalalas;
  if (arVoid < 0) {
    throw new BusinessError('قيمة الاسترداد ورسوم الإلغاء تتجاوز قيمة الجزء الملغى من الفاتورة', 400);
  }

  // ── Legacy fallback: no original journal to mirror ───────────────────────────
  // Legacy invoices have no original journal to mirror. Use their stored totals
  // and aggregate cost while preserving the same Bank/Fee/AR split as the
  // line-based path. This is especially important for a partially-paid full
  // cancellation, where the open AR must be written off as well.
  if (originalLines.length === 0) {
    const fb        = input.fallback ?? { revenueModel: 'principal', costPriceHalalas: 0 };
    const revAc     = fb.revenueModel === 'agent' ? GL.revenueAgent : GL.revenuePrincipal;
    const originalRevenue = Math.max(0, originalTotalHalalas - originalVatHalalas);
    const revenueReversal = Math.round(originalRevenue * reversalRatio);

    const lines: RefundJournalLine[] = [];
    if (revenueReversal > 0) lines.push({ ...revAc, dr: revenueReversal, cr: 0 });
    if (vatRev > 0)          lines.push({ ...GL.vatPayable, dr: vatRev, cr: 0 });
    if (refundAmountHalalas > 0) lines.push({ ...GL.bank, dr: 0, cr: refundAmountHalalas });
    if (cancelFeeNet > 0)         lines.push({ ...GL.cancellationFee, dr: 0, cr: cancelFeeNet });
    if (arVoid > 0)               lines.push({ ...GL.receivable, dr: 0, cr: arVoid });

    const refundCost = Math.round((fb.costPriceHalalas ?? 0) * reversalRatio);
    if (refundCost > 0) {
      lines.push({ ...GL.payableSupplier, dr: refundCost, cr: 0 });
      lines.push({ ...GL.costOfServices,  dr: 0, cr: refundCost });
    }
    return reconcileRounding(lines);
  }

  // ── Line-based reversal (the correct path) ───────────────────────────────────
  const lines: RefundJournalLine[] = [];

  // Reverse each original revenue / deferred-revenue credit line (Dr), pro-rated.
  for (const l of originalLines) {
    if (l.creditHalalas > 0 && isRevenueOrDeferred(l.accountCode)) {
      const amt = Math.round(l.creditHalalas * reversalRatio);
      if (amt > 0) lines.push(line(l.accountCode, l.accountNameAr, l.accountNameEn, amt, 0));
    }
  }
  // Reverse output VAT (Dr 2200) — refunded portion only (fee VAT retained).
  if (vatRev > 0) lines.push({ ...GL.vatPayable, dr: vatRev, cr: 0 });

  // Reverse the original AP (Cr 2000 → Dr 2000) pro-rated — unwinds the payable.
  for (const l of originalLines) {
    if (l.creditHalalas > 0 && l.accountCode === GL.payableSupplier.code) {
      const amt = Math.round(l.creditHalalas * reversalRatio);
      if (amt > 0) lines.push(line(l.accountCode, l.accountNameAr, l.accountNameEn, amt, 0));
    }
  }
  // Reverse the original COGS (Dr 5000 → Cr 5000) pro-rated.
  for (const l of originalLines) {
    if (l.debitHalalas > 0 && l.accountCode === GL.costOfServices.code) {
      const amt = Math.round(l.debitHalalas * reversalRatio);
      if (amt > 0) lines.push(line(l.accountCode, l.accountNameAr, l.accountNameEn, 0, amt));
    }
  }

  // Credit side: cash returned, retained fee re-recognised, and the open AR voided.
  lines.push({ ...GL.bank, dr: 0, cr: refundAmountHalalas });
  if (cancelFeeNet > 0) lines.push({ ...GL.cancellationFee, dr: 0, cr: cancelFeeNet });
  if (arVoid > 0)       lines.push({ ...GL.receivable, dr: 0, cr: arVoid });

  return reconcileRounding(lines);
}

function line(code: string, ar: string | null, en: string | null, dr: number, cr: number): RefundJournalLine {
  return { code, ar: ar ?? '', en: en ?? ar ?? '', dr, cr };
}

/**
 * Absorb the small residual from independent per-line rounding into the largest
 * revenue/deferred debit line so the entry balances exactly. Throws if the
 * imbalance is larger than the rounding tolerance (a genuine accounting error).
 */
function reconcileRounding(lines: RefundJournalLine[]): RefundJournalLine[] {
  const residual = lines.reduce((s, l) => s + l.dr, 0) - lines.reduce((s, l) => s + l.cr, 0);
  if (residual === 0) return lines;
  if (Math.abs(residual) > MAX_ROUNDING_HALALAS) {
    throw new BusinessError('تعذّر موازنة قيد الاسترداد — فرق يتجاوز حدود التقريب', 422);
  }
  // residual > 0 → too much debit → reduce the largest revenue debit.
  // residual < 0 → too much credit → increase the largest revenue debit.
  const target = lines
    .filter(l => l.dr > 0 && isRevenueOrDeferred(l.code))
    .sort((a, b) => b.dr - a.dr)[0];
  if (target) {
    target.dr -= residual;
  } else {
    // No revenue debit (degenerate) — adjust the bank credit instead.
    const bank = lines.find(l => l.code === GL.bank.code);
    if (bank) bank.cr += residual;
  }
  return assertBalanced(lines);
}

function assertBalanced(lines: RefundJournalLine[]): RefundJournalLine[] {
  const dr = lines.reduce((s, l) => s + l.dr, 0);
  const cr = lines.reduce((s, l) => s + l.cr, 0);
  if (dr !== cr) {
    throw new BusinessError('قيد الاسترداد غير متوازن', 422);
  }
  return lines;
}
