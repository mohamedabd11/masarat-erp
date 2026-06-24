/**
 * Customer-receipt & revenue-recognition journal builders.
 *
 * Pure, no DB. Extracted so the (small but financial) GL postings shared by
 * `payments/record`, the installment-pay route, and `invoices/recognize-revenue`
 * are built in ONE tested place instead of being copy-pasted inline in each.
 *
 *   Customer receipt:   Dr Cash/Bank/POS (by method) / Cr AR 1120
 *   Revenue recognition: Dr Deferred Revenue 3201 / Cr Revenue (4100 or 4000)
 */
import { GL, type GLAccount } from './gl-accounts';

export interface SimpleJournalLine {
  code: string;
  ar:   string;
  en:   string;
  dr:   number;
  cr:   number;
}

/**
 * Cash-side account a customer receipt debits, by payment method. Labels kept
 * verbatim from the original inline route maps so posted journal text is stable.
 */
export const CUSTOMER_RECEIPT_ACCOUNT: Record<string, GLAccount> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
};

const AC_RECEIVABLE: GLAccount = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };

const line = (ac: GLAccount, dr: number, cr: number): SimpleJournalLine =>
  ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

/**
 * A customer receipt settling an open invoice:
 *   Dr Cash/Bank/POS (amount) / Cr Accounts Receivable (amount).
 * Balanced by construction. Defaults to Bank for an unknown method (matches the
 * routes' `?? bank_transfer` fallback).
 */
export function buildCustomerReceiptLines(amountHalalas: number, method: string): SimpleJournalLine[] {
  const cashAc = CUSTOMER_RECEIPT_ACCOUNT[method] ?? CUSTOMER_RECEIPT_ACCOUNT['bank_transfer']!;
  return [line(cashAc, amountHalalas, 0), line(AC_RECEIVABLE, 0, amountHalalas)];
}

/**
 * Recognising previously-deferred travel revenue once the service is delivered:
 *   Dr Deferred Revenue 3201 / Cr Revenue (4000 agent fee model | 4100 principal).
 * VAT is NOT touched — it was already posted to 2200 at issuance.
 */
export function buildRevenueRecognitionLines(amountHalalas: number, revenueModel: string): SimpleJournalLine[] {
  const revenueAc = revenueModel === 'agent' ? GL.revenueAgent : GL.revenuePrincipal;
  return [line(GL.deferredRevenue, amountHalalas, 0), line(revenueAc, 0, amountHalalas)];
}
