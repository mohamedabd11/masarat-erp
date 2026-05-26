// Double-entry journal entry helper — posts entries and updates account running balances.
// All amounts are in halalas (1 SAR = 100 halalas).

// ─── Types ────────────────────────────────────────────────────────────────────

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
  revenueModel:    string;  // 'agent' | 'principal'
  isVatRegistered: boolean;
  grandTotal:      number;  // finalGrandTotal  (DR Receivable)
  totalCost:       number;  // storedTotalCost  (CR Payable — agent only)
  serviceFee:      number;  // storedServiceFee (CR Revenue — agent only)
  vatAmount:       number;  // totalVat         (CR VAT Payable)
  subtotalExclVat: number;  // excl-VAT revenue (CR Revenue — principal)
}

// ─── Standard Chart of Accounts ──────────────────────────────────────────────

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

// Maps a payment method string to the correct cash/bank/POS account
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

type AcDef = typeof AC[keyof typeof AC];

function jl(ac: AcDef, dr: number, cr: number): JELine {
  return {
    accountCode:   ac.code,
    accountNameAr: ac.nameAr,
    accountNameEn: ac.nameEn,
    accountType:   ac.type,
    debitHalalas:  dr,
    creditHalalas: cr,
  };
}

function computeBalance(type: string, dr: number, cr: number): number {
  return (type === 'asset' || type === 'expense') ? dr - cr : cr - dr;
}

// ─── Journal line builders ────────────────────────────────────────────────────

export function buildInvoiceLines(p: InvoicePricing): JELine[] {
  const { revenueModel, isVatRegistered, grandTotal, totalCost, serviceFee, vatAmount, subtotalExclVat } = p;
  if (grandTotal === 0) return [];

  if (revenueModel === 'agent') {
    const hasBreakdown = totalCost > 0 || serviceFee > 0;

    if (hasBreakdown) {
      // Normal agent: customer pays cost + fee + VAT on fee
      if (isVatRegistered && vatAmount > 0) {
        return [
          jl(AC.receivable,      grandTotal, 0),
          jl(AC.payableSupplier, 0, totalCost),
          jl(AC.revenueAgent,    0, serviceFee),
          jl(AC.vatPayable,      0, vatAmount),
        ];
      }
      return [
        jl(AC.receivable,      grandTotal, 0),
        jl(AC.payableSupplier, 0, totalCost),
        jl(AC.revenueAgent,    0, serviceFee),
      ];
    }

    // Fallback: no cost/fee breakdown available — post full amount as revenue
    if (isVatRegistered && vatAmount > 0) {
      return [
        jl(AC.receivable,   grandTotal,            0),
        jl(AC.revenueAgent, 0, grandTotal - vatAmount),
        jl(AC.vatPayable,   0, vatAmount),
      ];
    }
    return [
      jl(AC.receivable,   grandTotal, 0),
      jl(AC.revenueAgent, 0, grandTotal),
    ];
  }

  // Principal model: revenue = full selling price
  if (isVatRegistered && vatAmount > 0) {
    return [
      jl(AC.receivable,       grandTotal,     0),
      jl(AC.revenuePrincipal, 0, subtotalExclVat),
      jl(AC.vatPayable,       0, vatAmount),
    ];
  }
  return [
    jl(AC.receivable,       grandTotal, 0),
    jl(AC.revenuePrincipal, 0, grandTotal),
  ];
}

export function buildPaymentReceivedLines(
  amountHalalas: number,
  paymentMethod: PaymentMethod | string = 'bank_transfer',
): JELine[] {
  const payAc = resolvePaymentAccount(paymentMethod);
  return [
    jl(payAc,         amountHalalas, 0),
    jl(AC.receivable, 0, amountHalalas),
  ];
}

export function buildRefundLines(
  refundAmountHalalas: number,
  isVatRegistered:     boolean,
  revenueModel:        string,
  paymentMethod:       PaymentMethod | string = 'bank_transfer',
): JELine[] {
  if (refundAmountHalalas === 0) return [];
  const revenueAc = revenueModel === 'agent' ? AC.revenueAgent : AC.revenuePrincipal;
  const payAc     = resolvePaymentAccount(paymentMethod);

  if (isVatRegistered) {
    const exclVat = Math.round(refundAmountHalalas / 1.15);
    const vat     = refundAmountHalalas - exclVat;
    return [
      jl(revenueAc,    exclVat, 0),
      jl(AC.vatPayable, vat,    0),
      jl(payAc,         0,      refundAmountHalalas),
    ];
  }
  return [
    jl(revenueAc, refundAmountHalalas, 0),
    jl(payAc,     0, refundAmountHalalas),
  ];
}

export function buildSupplierPaymentLines(
  amountHalalas: number,
  paymentMethod: PaymentMethod | string = 'bank_transfer',
): JELine[] {
  const payAc = resolvePaymentAccount(paymentMethod);
  return [
    jl(AC.payableSupplier, amountHalalas, 0),
    jl(payAc,              0, amountHalalas),
  ];
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

export function buildExpensePaymentLines(
  amountHalalas: number,
  paymentMethod: PaymentMethod | string = 'bank_transfer',
  category: ExpenseCategory = 'other',
): JELine[] {
  const expenseAc = resolveExpenseAccount(category);
  const payAc     = resolvePaymentAccount(paymentMethod);
  return [
    jl(expenseAc, amountHalalas, 0),
    jl(payAc,     0, amountHalalas),
  ];
}

// ─── Core: post entry + update account balances ───────────────────────────────

export async function postJournalEntry(payload: JEPayload): Promise<void> {
  const {
    getFirestore, collection, doc, runTransaction, Timestamp,
  } = await import('firebase/firestore');
  const { getApp } = await import('@masarat/firebase');
  const db = getFirestore(getApp());

  const { lines, agencyId } = payload;

  // Validate: debits must equal credits
  const totalDR = lines.reduce((s, l) => s + l.debitHalalas,  0);
  const totalCR = lines.reduce((s, l) => s + l.creditHalalas, 0);
  if (totalDR !== totalCR) {
    throw new Error(`Journal entry not balanced: DR ${totalDR} ≠ CR ${totalCR}`);
  }
  if (totalDR === 0) return;

  const year     = new Date().getFullYear();
  const jeNumber = `JE-${year}-${String(Date.now()).slice(-8)}`;
  const jeRef    = doc(collection(db, 'journal_entries'));  // pre-generate ID

  const activeLines = lines.filter(l => l.debitHalalas > 0 || l.creditHalalas > 0);
  const accountRefs = activeLines.map(l =>
    doc(db, 'chart_of_accounts', `${agencyId}_${l.accountCode}`),
  );

  // Single atomic transaction: JE document + all account balance updates
  await runTransaction(db, async (tx) => {
    // Read all account docs first (required before writes in a transaction)
    const accountSnaps = await Promise.all(accountRefs.map(ref => tx.get(ref)));

    // Write the immutable journal entry
    tx.set(jeRef, {
      agencyId,
      jeNumber,
      description:        payload.description,
      referenceId:        payload.referenceId,
      referenceType:      payload.referenceType,
      status:             'posted',
      lines,
      totalDebitHalalas:  totalDR,
      totalCreditHalalas: totalCR,
      isBalanced:         true,
      postedAt:           Timestamp.now(),
      createdAt:          Timestamp.now(),
    });

    // Update or create each account balance
    for (let i = 0; i < activeLines.length; i++) {
      const l    = activeLines[i]!;
      const ref  = accountRefs[i]!;
      const snap = accountSnaps[i]!;

      if (!snap.exists()) {
        tx.set(ref, {
          agencyId,
          code:           l.accountCode,
          nameAr:         l.accountNameAr,
          nameEn:         l.accountNameEn,
          type:           l.accountType,
          side:           (l.accountType === 'asset' || l.accountType === 'expense') ? 'debit' : 'credit',
          debitTotal:     l.debitHalalas,
          creditTotal:    l.creditHalalas,
          balanceHalalas: computeBalance(l.accountType, l.debitHalalas, l.creditHalalas),
          createdAt:      Date.now(),
          updatedAt:      Date.now(),
        });
      } else {
        const d     = snap.data() as Record<string, number>;
        const newDR = (d['debitTotal']  ?? 0) + l.debitHalalas;
        const newCR = (d['creditTotal'] ?? 0) + l.creditHalalas;
        tx.update(ref, {
          debitTotal:     newDR,
          creditTotal:    newCR,
          balanceHalalas: computeBalance(l.accountType, newDR, newCR),
          updatedAt:      Date.now(),
        });
      }
    }
  });
}
