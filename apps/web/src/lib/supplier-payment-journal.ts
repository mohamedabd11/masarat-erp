/**
 * Supplier-payment journal builder — the GL double-entry for a disbursement
 * (paying a supplier / settling an overhead expense).
 *
 * Extracted from `api/supplier-payments/create` so the branching posting logic
 * (Input-VAT split, FX gain / loss / none) is unit-testable in isolation and
 * provably balanced (Σdr === Σcr) in every branch.
 *
 * Branches:
 *   1. Input-VAT split  — Dr expense(net) + Dr Input VAT(1230) / Cr cash(full).
 *      Lets VAT-registered agencies reclaim input tax on overheads.
 *   2. FX loss          — Dr expense(original) + Dr FX Loss(5900) / Cr cash(paid).
 *   3. FX gain          — Dr expense(original) / Cr cash(paid) + Cr FX Gain(4900).
 *   4. Plain            — Dr expense(amount) / Cr cash(amount).
 *
 * VAT and FX are mutually exclusive (VAT only on SAR purchases) — matching the
 * route, which takes the VAT branch first.
 *
 * Pure function: no DB / IO.
 */
import { GL, type GLAccount } from './gl-accounts';
import { BusinessError } from './api-auth';

export interface SupplierPaymentLine {
  code: string;
  ar:   string;
  en:   string;
  dr:   number;
  cr:   number;
}

export interface SupplierPaymentJournalInput {
  /** Expense / payable account being debited (per expense category). */
  expenseAccount: GLAccount;
  /** Cash / bank / POS account being credited (per payment method). */
  paymentAccount: GLAccount;
  /** Total SAR actually disbursed, in halalas (the cash credit). */
  resolvedAmountHalalas: number;
  /** VAT portion of the payment, in halalas (0 = none). */
  vatAmountHalalas: number;
  /**
   * Expense debit, in halalas. Equals the original booked SAR when an FX
   * original is supplied (so the FX difference splits off), else the resolved
   * amount. The FX difference = resolved − expenseDebit (>0 loss, <0 gain).
   */
  expenseDebitHalalas: number;
}

const line = (ac: GLAccount, dr: number, cr: number): SupplierPaymentLine =>
  ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

export function buildSupplierPaymentJournalLines(input: SupplierPaymentJournalInput): SupplierPaymentLine[] {
  const { expenseAccount, paymentAccount, resolvedAmountHalalas, vatAmountHalalas, expenseDebitHalalas } = input;

  let lines: SupplierPaymentLine[];

  // ── 1. Input-VAT split (takes precedence; VAT is only on SAR purchases) ──────
  if (vatAmountHalalas > 0 && vatAmountHalalas < resolvedAmountHalalas) {
    const netAmount = resolvedAmountHalalas - vatAmountHalalas;
    lines = [
      line(expenseAccount, netAmount, 0),
      line(GL.inputVat, vatAmountHalalas, 0),
      line(paymentAccount, 0, resolvedAmountHalalas),
    ];
    return assertBalanced(lines);
  }

  // ── 2–4. Expense debit + optional FX leg ────────────────────────────────────
  const fxDiff = resolvedAmountHalalas - expenseDebitHalalas; // >0 loss, <0 gain
  lines = [line(expenseAccount, expenseDebitHalalas, 0)];

  if (fxDiff > 0) {
    lines.push(line(GL.fxLoss, fxDiff, 0));
    lines.push(line(paymentAccount, 0, resolvedAmountHalalas));
  } else if (fxDiff < 0) {
    lines.push(line(paymentAccount, 0, resolvedAmountHalalas));
    lines.push(line(GL.fxGain, 0, -fxDiff));
  } else {
    lines.push(line(paymentAccount, 0, resolvedAmountHalalas));
  }

  return assertBalanced(lines);
}

function assertBalanced(lines: SupplierPaymentLine[]): SupplierPaymentLine[] {
  const dr = lines.reduce((s, l) => s + l.dr, 0);
  const cr = lines.reduce((s, l) => s + l.cr, 0);
  if (dr !== cr) {
    throw new BusinessError('قيد سند الصرف غير متوازن', 422);
  }
  return lines;
}
