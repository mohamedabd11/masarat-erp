// Journal entries are now created server-side within API route transactions.
// This module is kept for compatibility with MigrationTool and exposes builder helpers.
//
// NOTE (account-code source of truth): the `AC` map below is a LEGACY mapping used
// ONLY by the one-time data-migration tool (`components/accounting/MigrationTool.tsx`)
// and its unit tests, which assert these exact codes. It is intentionally NOT the
// runtime source of truth — all live API routes must import account codes from
// `lib/gl-accounts.ts` (the `GL` object) instead. Do not reuse this `AC` map in new
// runtime code: a few of its codes (e.g. 5900 "Other Expenses" here vs. 5900 "FX Loss"
// in GL) diverge from the canonical chart and exist only to reproduce historical
// migration postings.

export interface JELine {
  accountCode:   string;
  accountNameAr: string;
  accountNameEn: string;
  accountType:   'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  debitHalalas:  number;
  creditHalalas: number;
}

export interface JEPayload {
  agencyId:      string;
  description:   string;
  referenceId:   string;
  referenceType: 'invoice' | 'payment' | 'refund' | 'supplier_payment' | 'expense_payment' | 'manual';
  lines:         JELine[];
}

export interface InvoicePricing {
  revenueModel:    string;
  isVatRegistered: boolean;
  grandTotal:      number;
  totalCost:       number;
  serviceFee:      number;
  vatAmount:       number;
  subtotalExclVat: number;
}

export const AC = {
  cash:              { code: '1100', nameAr: 'الصندوق النقدي',                nameEn: 'Cash on Hand',                  type: 'asset'     as const },
  bank:              { code: '1110', nameAr: 'البنك',                         nameEn: 'Bank',                          type: 'asset'     as const },
  pos:               { code: '1115', nameAr: 'حساب الشبكة (نقاط البيع)',      nameEn: 'POS / Card Terminal',           type: 'asset'     as const },
  receivable:        { code: '1120', nameAr: 'ذمم مدينة - عملاء',             nameEn: 'Accounts Receivable',           type: 'asset'     as const },
  payableSupplier:   { code: '2000', nameAr: 'ذمم دائنة - موردون',             nameEn: 'Accounts Payable - Suppliers',  type: 'liability' as const },
  vatPayable:        { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة',   nameEn: 'VAT Payable',                   type: 'liability' as const },
  revenueAgent:      { code: '4000', nameAr: 'إيراد رسوم الوكالة',            nameEn: 'Revenue - Agency Fees',         type: 'revenue'   as const },
  revenuePrincipal:  { code: '4100', nameAr: 'إيراد خدمات السفر',             nameEn: 'Revenue - Travel Services',     type: 'revenue'   as const },
  costOfServices:    { code: '5000', nameAr: 'تكلفة الخدمات',                 nameEn: 'Cost of Services',              type: 'expense'   as const },
  operatingExpenses: { code: '5100', nameAr: 'مصاريف تشغيلية',               nameEn: 'Operating Expenses',            type: 'expense'   as const },
  salariesExpenses:  { code: '5200', nameAr: 'رواتب وأجور',                   nameEn: 'Salaries & Wages',              type: 'expense'   as const },
  officeExpenses:    { code: '5300', nameAr: 'مصاريف مكتبية',                 nameEn: 'Office Expenses',               type: 'expense'   as const },
  otherExpenses:     { code: '5900', nameAr: 'مصاريف أخرى',                   nameEn: 'Other Expenses',                type: 'expense'   as const },
} as const;

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'online' | 'check';

export function resolvePaymentAccount(method: PaymentMethod | string) {
  switch (method) {
    case 'cash':          return AC.cash;
    case 'bank_transfer': return AC.bank;
    case 'check':         return AC.bank;
    case 'card':          return AC.pos;
    case 'online':        return AC.pos;
    default:              return AC.bank;
  }
}

type AcDef = typeof AC[keyof typeof AC];

function jl(ac: AcDef, dr: number, cr: number): JELine {
  return { accountCode: ac.code, accountNameAr: ac.nameAr, accountNameEn: ac.nameEn, accountType: ac.type, debitHalalas: dr, creditHalalas: cr };
}

export function buildInvoiceLines(p: InvoicePricing): JELine[] {
  const { revenueModel, isVatRegistered, grandTotal, totalCost, serviceFee, vatAmount, subtotalExclVat } = p;
  if (grandTotal === 0) return [];
  if (revenueModel === 'agent') {
    const hasBreakdown = totalCost > 0 || serviceFee > 0;
    if (hasBreakdown) {
      const lines = [jl(AC.receivable, grandTotal, 0), jl(AC.payableSupplier, 0, totalCost), jl(AC.revenueAgent, 0, serviceFee)];
      if (isVatRegistered && vatAmount > 0) lines.push(jl(AC.vatPayable, 0, vatAmount));
      return lines;
    }
    if (isVatRegistered && vatAmount > 0) {
      return [jl(AC.receivable, grandTotal, 0), jl(AC.revenueAgent, 0, grandTotal - vatAmount), jl(AC.vatPayable, 0, vatAmount)];
    }
    return [jl(AC.receivable, grandTotal, 0), jl(AC.revenueAgent, 0, grandTotal)];
  }
  if (isVatRegistered && vatAmount > 0) {
    return [jl(AC.receivable, grandTotal, 0), jl(AC.revenuePrincipal, 0, subtotalExclVat), jl(AC.vatPayable, 0, vatAmount)];
  }
  return [jl(AC.receivable, grandTotal, 0), jl(AC.revenuePrincipal, 0, grandTotal)];
}

export function buildPaymentReceivedLines(amountHalalas: number, paymentMethod: PaymentMethod | string = 'bank_transfer'): JELine[] {
  const payAc = resolvePaymentAccount(paymentMethod);
  return [jl(payAc, amountHalalas, 0), jl(AC.receivable, 0, amountHalalas)];
}

export function buildRefundLines(refundAmountHalalas: number, isVatRegistered: boolean, revenueModel: string, paymentMethod: PaymentMethod | string = 'bank_transfer'): JELine[] {
  if (refundAmountHalalas === 0) return [];
  const revenueAc = revenueModel === 'agent' ? AC.revenueAgent : AC.revenuePrincipal;
  const payAc = resolvePaymentAccount(paymentMethod);
  if (isVatRegistered) {
    const exclVat = Math.round(refundAmountHalalas / 1.15);
    const vat     = refundAmountHalalas - exclVat;
    return [jl(revenueAc, exclVat, 0), jl(AC.vatPayable, vat, 0), jl(payAc, 0, refundAmountHalalas)];
  }
  return [jl(revenueAc, refundAmountHalalas, 0), jl(payAc, 0, refundAmountHalalas)];
}

export function buildSupplierPaymentLines(amountHalalas: number, paymentMethod: PaymentMethod | string = 'bank_transfer'): JELine[] {
  const payAc = resolvePaymentAccount(paymentMethod);
  return [jl(AC.payableSupplier, amountHalalas, 0), jl(payAc, 0, amountHalalas)];
}

export type ExpenseCategory = 'supplier' | 'operational' | 'salaries' | 'office' | 'other';

export function resolveExpenseAccount(category: ExpenseCategory) {
  switch (category) {
    case 'supplier':    return AC.costOfServices;
    case 'operational': return AC.operatingExpenses;
    case 'salaries':    return AC.salariesExpenses;
    case 'office':      return AC.officeExpenses;
    default:            return AC.otherExpenses;
  }
}

export function buildExpensePaymentLines(amountHalalas: number, paymentMethod: PaymentMethod | string = 'bank_transfer', category: ExpenseCategory = 'other'): JELine[] {
  const expenseAc = resolveExpenseAccount(category);
  const payAc     = resolvePaymentAccount(paymentMethod);
  return [jl(expenseAc, amountHalalas, 0), jl(payAc, 0, amountHalalas)];
}

// No-op: journal entries are now created server-side in API routes
export async function postJournalEntry(_payload: JEPayload): Promise<void> {
  return;
}
