/**
 * Centralized General Ledger (GL) account codes.
 *
 * Single source of truth for all GL account codes used across the accounting
 * engine. Previously each API route defined its own local `AC` object, which
 * caused code drift and reconciliation conflicts. Import from here instead.
 *
 * IMPORTANT: codes here must stay in sync with the seeded chart of accounts in
 * `src/app/api/auth/register/route.ts` (DEFAULT_COA).
 *
 * Account number ranges:
 *   1xxx Assets   2xxx Liabilities   3xxx Equity   4xxx Revenue   5xxx Expenses
 */
export const GL = {
  // ── Assets (1xxx) ──────────────────────────────────────────────────────────
  cash:             { code: '1100', ar: 'النقدية',                  en: 'Cash' },
  bank:             { code: '1110', ar: 'البنك',                    en: 'Bank' },
  posCard:          { code: '1115', ar: 'نقاط البيع',              en: 'POS / Card' },
  receivable:       { code: '1120', ar: 'ذمم مدينة - عملاء',       en: 'Accounts Receivable' },
  chequesReceivable:{ code: '1125', ar: 'أوراق قبض - شيكات',      en: 'Cheques Receivable' },
  prepaidExpenses:  { code: '1130', ar: 'المصاريف المدفوعة مقدماً', en: 'Prepaid Expenses' },
  bspClearing:      { code: '1350', ar: 'مقاصة BSP',               en: 'BSP Clearing' },

  // ── Liabilities (2xxx) ─────────────────────────────────────────────────────
  payableSupplier:  { code: '2000', ar: 'ذمم دائنة - موردون',      en: 'Accounts Payable' },
  payableAirlines:  { code: '2100', ar: 'ذمم دائنة — شركات الطيران', en: 'Accounts Payable - Airlines' },
  payableHotels:    { code: '2110', ar: 'ذمم دائنة — فنادق',       en: 'Accounts Payable - Hotels' },
  bspPayable:       { code: '2150', ar: 'مستحقات BSP',             en: 'BSP Payable' },
  vatPayable:       { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
  customerDeposits: { code: '2300', ar: 'ودائع العملاء',          en: 'Customer Deposits' },

  // ── Equity (3xxx) ──────────────────────────────────────────────────────────
  ownerCapital:     { code: '3100', ar: 'رأس مال المالك',         en: 'Owner Capital' },
  retainedEarnings: { code: '3200', ar: 'الأرباح المحتجزة',       en: 'Retained Earnings' },

  // ── Revenue (4xxx) ─────────────────────────────────────────────────────────
  revenueAgent:     { code: '4000', ar: 'إيراد رسوم الوكالة',     en: 'Revenue - Agency Fees' },
  revenuePrincipal: { code: '4100', ar: 'إيراد خدمات السفر',      en: 'Revenue - Travel Services' },
  admRecovery:      { code: '4420', ar: 'إيراد استرداد ADM',      en: 'ADM Recovery Income' },

  // ── Expenses (5xxx) ────────────────────────────────────────────────────────
  costOfServices:   { code: '5000', ar: 'تكلفة الخدمات',          en: 'Cost of Services' },
  admExpense:       { code: '5420', ar: 'مصروف ADM',              en: 'ADM Expense' },
} as const;

export type GLAccount = { code: string; ar: string; en: string };
