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
  referenceType: 'invoice' | 'payment' | 'refund' | 'supplier_payment' | 'manual';
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
  receivable:       { code: '1120', nameAr: 'ذمم مدينة - عملاء',            nameEn: 'Accounts Receivable',           type: 'asset'     as const },
  bank:             { code: '1110', nameAr: 'البنك',                        nameEn: 'Bank',                          type: 'asset'     as const },
  payableSupplier:  { code: '2000', nameAr: 'ذمم دائنة - موردون',            nameEn: 'Accounts Payable - Suppliers',  type: 'liability' as const },
  vatPayable:       { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة',  nameEn: 'VAT Payable',                   type: 'liability' as const },
  revenueAgent:     { code: '4000', nameAr: 'إيراد رسوم الوكالة',           nameEn: 'Revenue - Agency Fees',         type: 'revenue'   as const },
  revenuePrincipal: { code: '4100', nameAr: 'إيراد خدمات السفر',            nameEn: 'Revenue - Travel Services',     type: 'revenue'   as const },
  costOfServices:   { code: '5000', nameAr: 'تكلفة الخدمات',                nameEn: 'Cost of Services',              type: 'expense'   as const },
} as const;

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

export function buildPaymentReceivedLines(amountHalalas: number): JELine[] {
  return [
    jl(AC.bank,       amountHalalas, 0),
    jl(AC.receivable, 0, amountHalalas),
  ];
}

export function buildRefundLines(
  refundAmountHalalas: number,
  isVatRegistered:     boolean,
  revenueModel:        string,
): JELine[] {
  if (refundAmountHalalas === 0) return [];
  const revenueAc = revenueModel === 'agent' ? AC.revenueAgent : AC.revenuePrincipal;

  if (isVatRegistered) {
    const exclVat = Math.round(refundAmountHalalas / 1.15);
    const vat     = refundAmountHalalas - exclVat;
    return [
      jl(revenueAc,    exclVat, 0),
      jl(AC.vatPayable, vat,    0),
      jl(AC.bank,       0,      refundAmountHalalas),
    ];
  }
  return [
    jl(revenueAc, refundAmountHalalas, 0),
    jl(AC.bank,   0, refundAmountHalalas),
  ];
}

export function buildSupplierPaymentLines(amountHalalas: number): JELine[] {
  return [
    jl(AC.payableSupplier, amountHalalas, 0),
    jl(AC.bank,            0, amountHalalas),
  ];
}

// ─── Core: post entry + update account balances ───────────────────────────────

export async function postJournalEntry(payload: JEPayload): Promise<void> {
  const {
    getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, Timestamp,
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
  if (totalDR === 0) return; // nothing to post

  const year     = new Date().getFullYear();
  const jeNumber = `JE-${year}-${String(Date.now()).slice(-8)}`;

  // Save the immutable journal entry document
  await addDoc(collection(db, 'journal_entries'), {
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

  // Update running balances — use fixed document ID ${agencyId}_${code} to match useChartOfAccounts
  for (const l of lines) {
    if (l.debitHalalas === 0 && l.creditHalalas === 0) continue;

    const accountDocId = `${agencyId}_${l.accountCode}`;
    const accountRef   = doc(db, 'chart_of_accounts', accountDocId);
    const accountSnap  = await getDoc(accountRef);

    if (!accountSnap.exists()) {
      await setDoc(accountRef, {
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
      const d      = accountSnap.data() as Record<string, number>;
      const newDR  = (d.debitTotal  ?? 0) + l.debitHalalas;
      const newCR  = (d.creditTotal ?? 0) + l.creditHalalas;
      await updateDoc(accountRef, {
        debitTotal:     newDR,
        creditTotal:    newCR,
        balanceHalalas: computeBalance(l.accountType, newDR, newCR),
        updatedAt:      Date.now(),
      });
    }
  }
}
