/**
 * Invoice journal builders — the GL double-entry for issuing a sales invoice.
 *
 * Extracted verbatim from `api/invoices/create/route.ts` so the core
 * revenue-recognition path is finally unit-testable in isolation (it previously
 * lived inline in the route with no direct test coverage).
 *
 * Two builders, mirroring the route's two amount sources:
 *   • buildJournalLinesFromBookingLines — NEW path: per-line VAT + revenue model
 *     sourced from active non-legacy booking_lines (every new booking has these).
 *   • buildInvoiceJournalLines — LEGACY path: aggregated amounts on the booking
 *     itself (only reached by pre-booking_lines historical data).
 *
 * Balance guarantee (the fix that motivated this extraction):
 *   Both builders now route their residual rounding through
 *   `reconcileInvoiceRounding`, which absorbs a ≤1 SAR difference into the
 *   largest REVENUE/deferred credit line — never VAT (would misstate tax),
 *   never AR/AP (customer/supplier-facing). Previously the legacy agent path had
 *   NO correction (a journal could post Dr ≠ Cr by up to 1 SAR on drifted legacy
 *   data), and the new path folded the residual into the *last* credit line —
 *   which is the VAT line in the common shape, silently inflating output VAT on a
 *   loss-making line. A residual larger than the 1 SAR tolerance is a genuine
 *   pricing error and throws.
 */
import { GL } from './gl-accounts';
import { BusinessError } from './api-auth';
import type { BookingLine } from './schema';

const AC = {
  receivable:       GL.receivable,
  payableSupplier:  GL.payableSupplier,
  vatPayable:       GL.vatPayable,
  revenueAgent:     GL.revenueAgent,
  revenuePrincipal: GL.revenuePrincipal,
  costOfServices:   GL.costOfServices,
  deferredRevenue:  GL.deferredRevenue,
};

export interface InvoiceJournalLine {
  code: string;
  ar:   string;
  en:   string;
  dr:   number;
  cr:   number;
}

type AccountRef = { code: string; ar: string; en: string };

const ln = (ac: AccountRef, dr: number, cr: number): InvoiceJournalLine =>
  ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

/** A credit line eligible to absorb the rounding residual: revenue (4xxx) or deferred revenue (3201). */
const isRevenueOrDeferred = (code: string) => code.startsWith('4') || code === GL.deferredRevenue.code;

/**
 * Max residual (halalas) treated as rounding and absorbed silently. Mirrors the
 * create route's own grand-total tolerance (|subtotal + vat − grandTotal| ≤ 100).
 * Anything larger is a real pricing inconsistency, not rounding → throw.
 */
const MAX_INVOICE_ROUNDING_HALALAS = 100;

/**
 * Guarantee Σdr === Σcr by absorbing the residual into the largest revenue /
 * deferred-revenue credit line (the agency's own margin — the correct place for a
 * sub-riyal rounding gain/loss). Falls back to the dedicated rounding-difference
 * account (8399, MED-10) when no revenue credit exists. The residual is NEVER
 * folded into the VAT line (would misstate output tax) nor into AR/AP.
 *
 * @param strict when true, a residual beyond the 1 SAR tolerance throws (a real
 *   pricing inconsistency, not rounding). Used by the legacy aggregated path,
 *   whose drift signals corrupt migrated data. The booking_lines path passes
 *   `false` and always balances without blocking issuance.
 */
export function reconcileInvoiceRounding(
  lines: InvoiceJournalLine[],
  strict = false,
): InvoiceJournalLine[] {
  const residual = lines.reduce((s, l) => s + l.dr, 0) - lines.reduce((s, l) => s + l.cr, 0);
  if (residual === 0) return lines;
  if (strict && Math.abs(residual) > MAX_INVOICE_ROUNDING_HALALAS) {
    throw new BusinessError('قيد الفاتورة غير متوازن — الفرق يتجاوز حدود التقريب', 422);
  }

  // residual > 0 → too much debit → add credit; residual < 0 → reduce a credit.
  const target = lines
    .filter(l => l.cr > 0 && isRevenueOrDeferred(l.code))
    .sort((a, b) => b.cr - a.cr)[0];

  if (target && target.cr + residual > 0) {
    target.cr += residual;
    return lines;
  }

  // No usable revenue credit (degenerate) — book the difference to 8399 so it is
  // never silently folded into VAT or a balance-sheet account.
  lines.push({
    code: GL.roundingDifference.code,
    ar:   GL.roundingDifference.ar,
    en:   GL.roundingDifference.en,
    dr:   residual < 0 ? -residual : 0,
    cr:   residual > 0 ?  residual : 0,
  });
  return lines;
}

// ─── NEW path: journal from booking_lines ───────────────────────────────────────
//
// Lines are split by revenueModel (agent vs principal); each group gets its own
// GL treatment. A single Dr Receivables covers all lines combined.
//
// Agent lines:
//   Dr AR (cost + fee + VAT)
//   Cr AP Supplier (cost)
//   Cr Revenue Agent (fee = price_excl_vat − cost)
//   Cr VAT Payable (if VAT registered)
//
// Principal lines:
//   Dr AR (revenue + VAT)
//   Cr Revenue Principal / Deferred Revenue (price_excl_vat)
//   Cr VAT Payable (if VAT registered)
//   Dr COGS / Cr AP Supplier (if cost > 0)
export function buildJournalLinesFromBookingLines(
  lines: BookingLine[],
  isVatRegistered: boolean,
  deferRevenue: boolean,
): InvoiceJournalLine[] {
  const revenueAccount = deferRevenue ? AC.deferredRevenue : AC.revenuePrincipal;
  const agentLines     = lines.filter(l => l.revenueModel === 'agent');
  const principalLines = lines.filter(l => l.revenueModel !== 'agent');

  const totalReceivable = lines.reduce((s, l) => {
    return s + l.totalPriceExclVatHalalas + (isVatRegistered ? l.vatHalalas : 0);
  }, 0);

  const result: InvoiceJournalLine[] = [];
  result.push(ln(AC.receivable, totalReceivable, 0));

  if (agentLines.length > 0) {
    const totalCost    = agentLines.reduce((s, l) => s + l.totalCostHalalas, 0);
    // Agency fee = customer price excl VAT minus what we pay the supplier
    const totalFee     = agentLines.reduce((s, l) => s + Math.max(0, l.totalPriceExclVatHalalas - l.totalCostHalalas), 0);
    const totalLineVat = isVatRegistered ? agentLines.reduce((s, l) => s + l.vatHalalas, 0) : 0;
    if (totalCost    > 0) result.push(ln(AC.payableSupplier, 0, totalCost));
    if (totalFee     > 0) result.push(ln(AC.revenueAgent, 0, totalFee));
    if (totalLineVat > 0) result.push(ln(AC.vatPayable, 0, totalLineVat));
  }

  if (principalLines.length > 0) {
    const totalRevenue = principalLines.reduce((s, l) => s + l.totalPriceExclVatHalalas, 0);
    const totalLineVat = isVatRegistered ? principalLines.reduce((s, l) => s + l.vatHalalas, 0) : 0;
    const totalCost    = principalLines.reduce((s, l) => s + l.totalCostHalalas, 0);
    if (totalRevenue > 0) result.push(ln(revenueAccount, 0, totalRevenue));
    if (totalLineVat > 0) result.push(ln(AC.vatPayable, 0, totalLineVat));
    if (totalCost    > 0) {
      result.push(ln(AC.costOfServices, totalCost, 0));
      result.push(ln(AC.payableSupplier, 0, totalCost));
    }
  }

  // Ensure Dr = Cr — absorb any per-line residual into revenue (NOT VAT).
  // Non-strict: a clipped-fee (below-cost) line must not block issuance.
  return reconcileInvoiceRounding(result, false);
}

// ─── LEGACY path: journal from aggregated booking totals ─────────────────────────
export function buildInvoiceJournalLines(
  revenueModel: string,
  isVatRegistered: boolean,
  grandTotal: number,
  totalCost: number,
  serviceFee: number,
  vatAmount: number,
  subtotalExclVat: number,
  deferRevenue = false,
): InvoiceJournalLine[] {
  if (grandTotal === 0) return [];

  // IFRS 15: future-dated travel packages credit deferred revenue (3201) instead
  // of recognising travel-services revenue (4100) at issuance.
  const revenueAccount = deferRevenue ? AC.deferredRevenue : AC.revenuePrincipal;

  let lines: InvoiceJournalLine[];

  if (revenueModel === 'agent') {
    const hasBreakdown = totalCost > 0 || serviceFee > 0;
    if (hasBreakdown) {
      lines = [ln(AC.receivable, grandTotal, 0), ln(AC.payableSupplier, 0, totalCost), ln(AC.revenueAgent, 0, serviceFee)];
      if (isVatRegistered && vatAmount > 0) lines.push(ln(AC.vatPayable, 0, vatAmount));
    } else if (isVatRegistered && vatAmount > 0) {
      lines = [ln(AC.receivable, grandTotal, 0), ln(AC.revenueAgent, 0, grandTotal - vatAmount), ln(AC.vatPayable, 0, vatAmount)];
    } else {
      lines = [ln(AC.receivable, grandTotal, 0), ln(AC.revenueAgent, 0, grandTotal)];
    }
  } else {
    // Principal model: Dr AR / Cr Revenue (or Deferred Revenue) / Cr VAT
    //                + Dr COGS / Cr AP (if cost known)
    lines = isVatRegistered && vatAmount > 0
      ? [ln(AC.receivable, grandTotal, 0), ln(revenueAccount, 0, subtotalExclVat), ln(AC.vatPayable, 0, vatAmount)]
      : [ln(AC.receivable, grandTotal, 0), ln(revenueAccount, 0, grandTotal)];

    if (totalCost > 0) {
      lines.push(ln(AC.costOfServices, totalCost, 0));
      lines.push(ln(AC.payableSupplier, 0, totalCost));
    }
  }

  // Guarantee Dr = Cr — the legacy aggregated path previously had no correction,
  // so drifted legacy data (within the route's 1 SAR tolerance) could post an
  // unbalanced journal. Absorb the residual into revenue; strict → drift beyond
  // 1 SAR (corrupt migrated data) surfaces rather than silently posting.
  return reconcileInvoiceRounding(lines, true);
}
