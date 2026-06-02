/**
 * Tests for bank reconciliation logic (pure functions — no DB required).
 *
 * All functions are defined inline here because there is no separate
 * reconciliation lib file. The test validates the business rules that
 * the reconciliation API routes implement.
 */
import { describe, it, expect } from 'vitest';
import { GL } from '@/lib/gl-accounts';

// ─── Types ────────────────────────────────────────────────────────────────────

type TxType =
  | 'deposit'
  | 'transfer_in'
  | 'payment_received'
  | 'withdrawal'
  | 'transfer_out'
  | 'payment_sent';

interface BankTransaction {
  id:             string;
  type:           TxType;
  amountHalalas:  number;
  isReconciled:   boolean;
}

// ─── Pure reconciliation logic ────────────────────────────────────────────────

/** Sign convention: credits to the account are positive, debits are negative */
function txSign(type: TxType): 1 | -1 {
  switch (type) {
    case 'deposit':
    case 'transfer_in':
    case 'payment_received':
      return 1;
    case 'withdrawal':
    case 'transfer_out':
    case 'payment_sent':
      return -1;
  }
}

/** Sum only unreconciled transactions (applying correct sign) */
function unreconciledSum(transactions: BankTransaction[]): number {
  return transactions
    .filter(t => !t.isReconciled)
    .reduce((sum, t) => sum + txSign(t.type) * t.amountHalalas, 0);
}

/** Discrepancy = bookBalance - statementBalance */
function discrepancy(bookBalance: number, statementBalance: number): number {
  return bookBalance - statementBalance;
}

/** Whether a discrepancy requires a journal entry (|diff| >= 1 halala) */
function needsJournalEntry(discrepancyHalalas: number): boolean {
  return Math.abs(discrepancyHalalas) >= 1;
}

/**
 * Build reconciliation journal lines.
 * Shortage (book > statement) → DR reconcileExpense (5510) / CR bank (1110)
 * Surplus  (book < statement) → DR bank (1110) / CR reconcileIncome (4510)
 */
function buildReconcileJournalLines(
  discrepancyHalalas: number,
  bankAccountCode: string = GL.bank.code,
): { accountCode: string; debitHalalas: number; creditHalalas: number }[] {
  if (discrepancyHalalas === 0) return [];
  const abs = Math.abs(discrepancyHalalas);
  if (discrepancyHalalas > 0) {
    // Shortage: book shows more than statement → expense
    return [
      { accountCode: GL.reconcileExpense.code, debitHalalas: abs, creditHalalas: 0 },
      { accountCode: bankAccountCode,          debitHalalas: 0,   creditHalalas: abs },
    ];
  } else {
    // Surplus: bank statement shows more than book → income
    return [
      { accountCode: bankAccountCode,         debitHalalas: abs, creditHalalas: 0 },
      { accountCode: GL.reconcileIncome.code, debitHalalas: 0,   creditHalalas: abs },
    ];
  }
}

/** Parse statement date to extract year for journal numbering */
function parseStatementYear(statementDate: string): number {
  return parseInt(statementDate.split('-')[0] ?? '0', 10);
}

// ─── 1. Unreconciled sum ──────────────────────────────────────────────────────

describe('unreconciledSum — مجموع المعاملات غير المطابقة', () => {

  it('إيداع غير مطابق → قيمة موجبة', () => {
    const txs: BankTransaction[] = [
      { id: '1', type: 'deposit', amountHalalas: 50000, isReconciled: false },
    ];
    expect(unreconciledSum(txs)).toBe(50000);
  });

  it('سحب غير مطابق → قيمة سالبة', () => {
    const txs: BankTransaction[] = [
      { id: '1', type: 'withdrawal', amountHalalas: 30000, isReconciled: false },
    ];
    expect(unreconciledSum(txs)).toBe(-30000);
  });

  it('خليط من إيداعات وسحوبات غير مطابقة → مجموع صحيح', () => {
    const txs: BankTransaction[] = [
      { id: '1', type: 'deposit',    amountHalalas: 100000, isReconciled: false },
      { id: '2', type: 'withdrawal', amountHalalas: 30000,  isReconciled: false },
      { id: '3', type: 'deposit',    amountHalalas: 20000,  isReconciled: false },
    ];
    // 100000 - 30000 + 20000 = 90000
    expect(unreconciledSum(txs)).toBe(90000);
  });

  it('جميع المعاملات مطابقة → المجموع = 0', () => {
    const txs: BankTransaction[] = [
      { id: '1', type: 'deposit',    amountHalalas: 50000, isReconciled: true },
      { id: '2', type: 'withdrawal', amountHalalas: 50000, isReconciled: true },
    ];
    expect(unreconciledSum(txs)).toBe(0);
  });

  it('قائمة فارغة → المجموع = 0', () => {
    expect(unreconciledSum([])).toBe(0);
  });
});

// ─── 2. Discrepancy detection ─────────────────────────────────────────────────

describe('discrepancy — الكشف عن الفروق', () => {

  it('book=100000, statement=99000 → فرق 1000 (عجز)', () => {
    expect(discrepancy(100000, 99000)).toBe(1000);
  });

  it('book=99000, statement=100000 → فرق -1000 (فائض)', () => {
    expect(discrepancy(99000, 100000)).toBe(-1000);
  });

  it('book = statement → فرق صفر', () => {
    expect(discrepancy(50000, 50000)).toBe(0);
  });

  it('عجز كبير → قيمة موجبة كبيرة', () => {
    expect(discrepancy(1000000, 500000)).toBe(500000);
  });
});

// ─── 3. Discrepancy threshold ─────────────────────────────────────────────────

describe('needsJournalEntry — عتبة القيد المحاسبي', () => {

  it('|فرق| < 1 → لا يحتاج قيد محاسبي', () => {
    expect(needsJournalEntry(0)).toBe(false);
  });

  it('|فرق| = 1 هللة → يحتاج قيد محاسبي', () => {
    expect(needsJournalEntry(1)).toBe(true);
    expect(needsJournalEntry(-1)).toBe(true);
  });

  it('|فرق| > 1 → يحتاج قيد محاسبي', () => {
    expect(needsJournalEntry(1000)).toBe(true);
    expect(needsJournalEntry(-1000)).toBe(true);
  });
});

// ─── 4. Journal entry for shortage (DR reconcileExpense / CR bank) ─────────

describe('buildReconcileJournalLines — قيد العجز', () => {

  it('عجز 1000 هللة → مدين 5510 / دائن 1110', () => {
    const lines = buildReconcileJournalLines(1000);
    expect(lines).toHaveLength(2);
    const expenseLine = lines.find(l => l.accountCode === GL.reconcileExpense.code);
    const bankLine    = lines.find(l => l.accountCode === GL.bank.code);
    expect(expenseLine).toBeDefined();
    expect(bankLine).toBeDefined();
    expect(expenseLine?.debitHalalas).toBe(1000);
    expect(expenseLine?.creditHalalas).toBe(0);
    expect(bankLine?.debitHalalas).toBe(0);
    expect(bankLine?.creditHalalas).toBe(1000);
  });

  it('قيد العجز متوازن (مدين = دائن)', () => {
    const lines = buildReconcileJournalLines(500);
    const dr = lines.reduce((s, l) => s + l.debitHalalas, 0);
    const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
  });

  it('حساب مصروف المطابقة هو 5510', () => {
    expect(GL.reconcileExpense.code).toBe('5510');
  });
});

// ─── 5. Journal entry for surplus (DR bank / CR reconcileIncome) ──────────

describe('buildReconcileJournalLines — قيد الفائض', () => {

  it('فائض 1000 هللة → مدين 1110 / دائن 4510', () => {
    const lines = buildReconcileJournalLines(-1000);
    expect(lines).toHaveLength(2);
    const bankLine   = lines.find(l => l.accountCode === GL.bank.code);
    const incomeLine = lines.find(l => l.accountCode === GL.reconcileIncome.code);
    expect(bankLine).toBeDefined();
    expect(incomeLine).toBeDefined();
    expect(bankLine?.debitHalalas).toBe(1000);
    expect(bankLine?.creditHalalas).toBe(0);
    expect(incomeLine?.debitHalalas).toBe(0);
    expect(incomeLine?.creditHalalas).toBe(1000);
  });

  it('قيد الفائض متوازن (مدين = دائن)', () => {
    const lines = buildReconcileJournalLines(-750);
    const dr = lines.reduce((s, l) => s + l.debitHalalas, 0);
    const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
  });

  it('حساب إيراد المطابقة هو 4510', () => {
    expect(GL.reconcileIncome.code).toBe('4510');
  });
});

// ─── 6. Statement date parsing ────────────────────────────────────────────────

describe('parseStatementYear — تحليل تاريخ كشف الحساب', () => {

  it('2024-03-31 → year = 2024', () => {
    expect(parseStatementYear('2024-03-31')).toBe(2024);
  });

  it('2025-12-31 → year = 2025', () => {
    expect(parseStatementYear('2025-12-31')).toBe(2025);
  });

  it('2023-01-01 → year = 2023', () => {
    expect(parseStatementYear('2023-01-01')).toBe(2023);
  });
});

// ─── 7. Transaction type classification ───────────────────────────────────────

describe('txSign — تصنيف نوع المعاملة وعلامتها', () => {

  it('deposit → علامة موجبة (+1)', () => {
    expect(txSign('deposit')).toBe(1);
  });

  it('transfer_in → علامة موجبة (+1)', () => {
    expect(txSign('transfer_in')).toBe(1);
  });

  it('payment_received → علامة موجبة (+1)', () => {
    expect(txSign('payment_received')).toBe(1);
  });

  it('withdrawal → علامة سالبة (-1)', () => {
    expect(txSign('withdrawal')).toBe(-1);
  });

  it('transfer_out → علامة سالبة (-1)', () => {
    expect(txSign('transfer_out')).toBe(-1);
  });

  it('payment_sent → علامة سالبة (-1)', () => {
    expect(txSign('payment_sent')).toBe(-1);
  });

  it('الأنواع الستة كلها لها علامات محددة', () => {
    const allTypes: TxType[] = [
      'deposit', 'transfer_in', 'payment_received',
      'withdrawal', 'transfer_out', 'payment_sent',
    ];
    for (const t of allTypes) {
      expect([1, -1]).toContain(txSign(t));
    }
  });
});

// ─── 8. Already-reconciled transactions excluded ──────────────────────────────

describe('unreconciledSum — المعاملات المطابقة مسبقاً تُستبعد', () => {

  it('معاملة مطابقة مسبقاً لا تُدرج في المجموع', () => {
    const txs: BankTransaction[] = [
      { id: '1', type: 'deposit',    amountHalalas: 100000, isReconciled: true  },
      { id: '2', type: 'withdrawal', amountHalalas: 30000,  isReconciled: false },
    ];
    // Only the unreconciled withdrawal counts: -30000
    expect(unreconciledSum(txs)).toBe(-30000);
  });

  it('مزيج من مطابقة وغير مطابقة: يحسب فقط غير المطابقة', () => {
    const txs: BankTransaction[] = [
      { id: '1', type: 'deposit',    amountHalalas: 200000, isReconciled: true  },
      { id: '2', type: 'deposit',    amountHalalas: 50000,  isReconciled: false },
      { id: '3', type: 'withdrawal', amountHalalas: 20000,  isReconciled: false },
      { id: '4', type: 'withdrawal', amountHalalas: 80000,  isReconciled: true  },
    ];
    // Only id 2 and 3: 50000 - 20000 = 30000
    expect(unreconciledSum(txs)).toBe(30000);
  });

  it('فرق صفر لا يتطلب قيداً محاسبياً', () => {
    const lines = buildReconcileJournalLines(0);
    expect(lines).toHaveLength(0);
  });

  it('خط بنكي مخصص يُستخدم في القيد المحاسبي', () => {
    const lines = buildReconcileJournalLines(500, '1120');
    const bankLine = lines.find(l => l.accountCode === '1120');
    expect(bankLine).toBeDefined();
  });
});
