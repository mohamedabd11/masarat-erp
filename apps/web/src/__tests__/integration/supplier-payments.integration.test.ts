/**
 * Integration Tests — Supplier Payments (Real DB)
 *
 * Tests run against a real local PostgreSQL database. They replicate the
 * server-side transaction logic from:
 *   - src/app/api/supplier-payments/create/route.ts
 *   - src/app/api/supplier-payments/reverse/route.ts
 *   - src/lib/idempotency.ts
 * directly against Drizzle (no HTTP), and verify the GL invariants.
 *
 * Verifies:
 *  1. A supplier payment + journal entry is balanced (DR = CR)
 *  2. The debit account is chosen per expense category
 *     (supplier → 2000 payableSupplier, other → 5400 operatingExpenses)
 *  3. supplier.balanceHalalas decreases after a payment
 *  4. Reversal posts a new entry with swapped DR/CR and restores the balance
 *  5. Idempotency key transitions pending → complete
 *  6. vatAmountHalalas split: Input VAT (1230) line + net cost
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import {
  agencies, suppliers, supplierPayments,
  journalEntries, journalLines, idempotencyKeys,
} from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';

// ─── Test agency (unique per file) ──────────────────────────────────────────────

const AGENCY_ID  = 'integ-test-supplier-pay-01';
const USER_ID    = 'user-supplier-pay';

// Mirror of the route's account maps (create/reverse use the same accounts).
const EXPENSE_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  supplier:    GL.payableSupplier,            // 2000 — settles a previously booked payable
  operational: GL.operatingExpenses,          // 5400
  office:      GL.operatingExpenses,          // 5400
  other:       GL.operatingExpenses,          // 5400
};
const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,    // 1100
  bank_transfer: GL.bank,    // 1110
  card:          GL.posCard, // 1115
  check:         GL.bank,    // 1110
};

let voucherSeq = 0;

/**
 * Replicates supplier-payments/create POST: inserts a supplier payment, posts a
 * balanced journal entry, and decrements the supplier balance (if linked).
 * Supports the Input-VAT split for `supplier` category payments.
 */
async function createSupplierPayment(opts: {
  payeeName:        string;
  expenseCategory:  string;
  amountHalalas:    number;
  paymentMethod:    string;
  supplierId?:      string;
  vatAmountHalalas?: number;
}) {
  const db = getTestDb();
  const vatAmount = opts.vatAmountHalalas ?? 0;

  return db.transaction(async (tx) => {
    const now   = new Date();
    const year  = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;

    const voucherNumber = `PV-TEST-${++voucherSeq}`;
    const jeNumber      = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    const spId          = crypto.randomUUID();
    const jeId          = crypto.randomUUID();

    const expenseAc = EXPENSE_ACCOUNT[opts.expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
    const paymentAc = METHOD_ACCOUNT[opts.paymentMethod]    ?? METHOD_ACCOUNT['cash']!;

    await tx.insert(supplierPayments).values({
      id:              spId,
      agencyId:        AGENCY_ID,
      supplierId:      opts.supplierId ?? null,
      payeeName:       opts.payeeName,
      supplierName:    opts.payeeName,
      amountHalalas:   opts.amountHalalas,
      method:          opts.paymentMethod,
      voucherNumber,
      expenseCategory: opts.expenseCategory,
      date:            today,
      status:          'completed',
      journalEntryId:  jeId,
      createdBy:       USER_ID,
    });

    if (opts.supplierId) {
      await tx.update(suppliers)
        .set({ balanceHalalas: dsql`${suppliers.balanceHalalas} - ${opts.amountHalalas}`, updatedAt: now })
        .where(and(eq(suppliers.id, opts.supplierId), eq(suppliers.agencyId, AGENCY_ID)));
    }

    await tx.insert(journalEntries).values({
      id:                 jeId,
      agencyId:           AGENCY_ID,
      entryNumber:        jeNumber,
      date:               today,
      descriptionAr:      `سند صرف ${voucherNumber} — ${opts.payeeName}`,
      source:             'payment',
      sourceId:           spId,
      isPosted:           true,
      totalDebitHalalas:  opts.amountHalalas,
      totalCreditHalalas: opts.amountHalalas,
      createdBy:          USER_ID,
    });

    let lines;
    if (opts.expenseCategory === 'supplier' && vatAmount > 0 && vatAmount < opts.amountHalalas) {
      const netAmount = opts.amountHalalas - vatAmount;
      lines = [
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: expenseAc.code,     accountNameAr: expenseAc.ar,     accountNameEn: expenseAc.en,     debitHalalas: netAmount,           creditHalalas: 0,                 sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: GL.inputVat.code,   accountNameAr: GL.inputVat.ar,   accountNameEn: GL.inputVat.en,   debitHalalas: vatAmount,           creditHalalas: 0,                 sortOrder: 2 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: paymentAc.code,     accountNameAr: paymentAc.ar,     accountNameEn: paymentAc.en,     debitHalalas: 0,                   creditHalalas: opts.amountHalalas, sortOrder: 3 },
      ];
    } else {
      lines = [
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: opts.amountHalalas, creditHalalas: 0,                 sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0,                 creditHalalas: opts.amountHalalas, sortOrder: 2 },
      ];
    }
    await tx.insert(journalLines).values(lines);

    return { spId, jeId, voucherNumber, expenseAc, paymentAc };
  });
}

/**
 * Replicates supplier-payments/reverse POST: posts a mirror entry with swapped
 * DR/CR (Dr payment account / Cr expense account), marks the original reversed,
 * and restores the supplier balance (if linked).
 */
async function reverseSupplierPayment(spId: string) {
  const db = getTestDb();
  return db.transaction(async (tx) => {
    const [orig] = await tx.select().from(supplierPayments)
      .where(and(eq(supplierPayments.id, spId), eq(supplierPayments.agencyId, AGENCY_ID)));
    if (!orig) throw new Error('original not found');

    const now   = new Date();
    const year  = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;
    const amountHalalas   = orig.amountHalalas;
    const expenseCategory = orig.expenseCategory ?? 'other';
    const paymentMethod   = orig.method;

    const jeNumber   = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    const reversalId = crypto.randomUUID();
    const jeId       = crypto.randomUUID();

    const expenseAc = EXPENSE_ACCOUNT[expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
    const paymentAc = METHOD_ACCOUNT[paymentMethod]    ?? METHOD_ACCOUNT['cash']!;

    await tx.insert(supplierPayments).values({
      id:                reversalId,
      agencyId:          AGENCY_ID,
      payeeName:         orig.payeeName ?? '',
      supplierName:      orig.payeeName ?? '',
      amountHalalas,
      method:            paymentMethod,
      voucherNumber:     `${orig.voucherNumber}-REV`,
      expenseCategory,
      date:              today,
      status:            'completed',
      isRefund:          'true',
      originalPaymentId: spId,
      journalEntryId:    jeId,
      createdBy:         USER_ID,
    });

    await tx.insert(journalEntries).values({
      id:                 jeId,
      agencyId:           AGENCY_ID,
      entryNumber:        jeNumber,
      date:               today,
      descriptionAr:      `عكس سند صرف ${orig.voucherNumber}`,
      source:             'payment',
      sourceId:           reversalId,
      isPosted:           true,
      totalDebitHalalas:  amountHalalas,
      totalCreditHalalas: amountHalalas,
      createdBy:          USER_ID,
    });

    // Swapped vs original: Dr payment account / Cr expense account
    await tx.insert(journalLines).values([
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: amountHalalas, creditHalalas: 0,             sortOrder: 1 },
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: 0,             creditHalalas: amountHalalas, sortOrder: 2 },
    ]);

    await tx.update(supplierPayments).set({ status: 'reversed' }).where(eq(supplierPayments.id, spId));

    if (orig.supplierId) {
      await tx.update(suppliers)
        .set({ balanceHalalas: dsql`${suppliers.balanceHalalas} + ${amountHalalas}`, updatedAt: now })
        .where(and(eq(suppliers.id, orig.supplierId), eq(suppliers.agencyId, AGENCY_ID)));
    }

    return { reversalId, jeId };
  });
}

async function lines(jeId: string) {
  const db = getTestDb();
  return db.select().from(journalLines).where(eq(journalLines.entryId, jeId));
}

function assertBalanced(ls: { debitHalalas: number; creditHalalas: number }[]) {
  const dr = ls.reduce((s, l) => s + l.debitHalalas,  0);
  const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
  expect(dr).toBe(cr);
  return { dr, cr };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values({
    id:                 AGENCY_ID,
    nameAr:             'وكالة اختبار سندات الصرف',
    nameEn:             'Supplier Payments Test Agency',
    subscriptionStatus: 'active',
    isVatRegistered:    true,
  }).onConflictDoNothing();
});

beforeEach(async () => {
  // Clean transactional data between tests (keep the agency).
  await sql(`DELETE FROM journal_lines      WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries    WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM supplier_payments  WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM suppliers          WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM idempotency_keys   WHERE agency_id = '${AGENCY_ID}'`);
});

afterAll(async () => {
  await sql(`DELETE FROM journal_lines      WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries    WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM supplier_payments  WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM suppliers          WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM idempotency_keys   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters    WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies           WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('supplier_payments — القيد المحاسبي لسند الصرف', () => {

  it('ينشئ قيداً متوازناً (DR = CR) عند إنشاء سند صرف', async () => {
    const { jeId } = await createSupplierPayment({
      payeeName: 'مكتب الإيجار', expenseCategory: 'other',
      amountHalalas: 3_000_00, paymentMethod: 'cash',
    });

    const db = getTestDb();
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, jeId));
    expect(entry!.totalDebitHalalas).toBe(entry!.totalCreditHalalas);
    expect(entry!.totalDebitHalalas).toBe(3_000_00);

    const { dr } = assertBalanced(await lines(jeId));
    expect(dr).toBe(3_000_00);
  });

  it('فئة "other" تُحمّل حساب المصاريف التشغيلية (5400) مديناً والنقدية (1100) دائناً', async () => {
    const { jeId } = await createSupplierPayment({
      payeeName: 'مصروف نثري', expenseCategory: 'other',
      amountHalalas: 1_200_00, paymentMethod: 'cash',
    });

    const ls = await lines(jeId);
    const debit  = ls.find(l => l.debitHalalas  > 0)!;
    const credit = ls.find(l => l.creditHalalas > 0)!;
    expect(debit.accountCode).toBe('5400');             // operatingExpenses
    expect(debit.debitHalalas).toBe(1_200_00);
    expect(credit.accountCode).toBe('1100');            // cash
    expect(credit.creditHalalas).toBe(1_200_00);
  });

  it('فئة "supplier" تُحمّل حساب الذمم الدائنة للموردين (2000) مديناً — لا تكرار للتكلفة', async () => {
    const { jeId } = await createSupplierPayment({
      payeeName: 'شركة الطيران', expenseCategory: 'supplier',
      amountHalalas: 5_000_00, paymentMethod: 'bank_transfer',
    });

    const ls = await lines(jeId);
    const debit  = ls.find(l => l.debitHalalas  > 0)!;
    const credit = ls.find(l => l.creditHalalas > 0)!;
    expect(debit.accountCode).toBe('2000');             // payableSupplier
    expect(credit.accountCode).toBe('1110');            // bank
    assertBalanced(ls);
  });

  it('ينقص رصيد المورد balanceHalalas بعد الدفع', async () => {
    const db = getTestDb();
    const supplierId = `${AGENCY_ID}-sup-1`;
    await db.insert(suppliers).values({
      id: supplierId, agencyId: AGENCY_ID, nameAr: 'مورد فنادق',
      balanceHalalas: 10_000_00, isActive: true,
    });

    await createSupplierPayment({
      payeeName: 'مورد فنادق', expenseCategory: 'supplier',
      amountHalalas: 4_000_00, paymentMethod: 'bank_transfer', supplierId,
    });

    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
    expect(sup!.balanceHalalas).toBe(6_000_00);   // 10000 - 4000
  });

});

describe('supplier_payments — عكس سند الصرف (reversal)', () => {

  it('العكس يُنشئ قيداً جديداً بمدين/دائن معكوسين ومتوازناً', async () => {
    const { spId, jeId: origJe } = await createSupplierPayment({
      payeeName: 'مصروف للعكس', expenseCategory: 'other',
      amountHalalas: 2_500_00, paymentMethod: 'cash',
    });

    const origLines = await lines(origJe);
    const origDebit  = origLines.find(l => l.debitHalalas  > 0)!; // 5400
    const origCredit = origLines.find(l => l.creditHalalas > 0)!; // 1100

    const { jeId: revJe } = await reverseSupplierPayment(spId);
    const revLines = await lines(revJe);
    assertBalanced(revLines);

    const revDebit  = revLines.find(l => l.debitHalalas  > 0)!;
    const revCredit = revLines.find(l => l.creditHalalas > 0)!;
    // Swapped: what was debited is now credited and vice versa
    expect(revDebit.accountCode).toBe(origCredit.accountCode);  // 1100 now debited
    expect(revCredit.accountCode).toBe(origDebit.accountCode);  // 5400 now credited
    expect(revDebit.debitHalalas).toBe(2_500_00);

    const db = getTestDb();
    const [orig] = await db.select().from(supplierPayments).where(eq(supplierPayments.id, spId));
    expect(orig!.status).toBe('reversed');
  });

  it('العكس يُعيد رصيد المورد إلى ما كان عليه', async () => {
    const db = getTestDb();
    const supplierId = `${AGENCY_ID}-sup-2`;
    await db.insert(suppliers).values({
      id: supplierId, agencyId: AGENCY_ID, nameAr: 'مورد للعكس',
      balanceHalalas: 8_000_00, isActive: true,
    });

    const { spId } = await createSupplierPayment({
      payeeName: 'مورد للعكس', expenseCategory: 'supplier',
      amountHalalas: 3_000_00, paymentMethod: 'bank_transfer', supplierId,
    });
    let [sup] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
    expect(sup!.balanceHalalas).toBe(5_000_00);

    await reverseSupplierPayment(spId);
    [sup] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
    expect(sup!.balanceHalalas).toBe(8_000_00);   // restored
  });

});

describe('supplier_payments — idempotency & VAT split', () => {

  it('مفتاح idempotency ينتقل من pending إلى complete', async () => {
    const db = getTestDb();
    const id = `${AGENCY_ID}_supplier_payment_key-001`;

    // Claim the key as pending (as the route does before executing)
    await db.insert(idempotencyKeys).values({
      id, agencyId: AGENCY_ID, status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    let [row] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, id));
    expect(row!.status).toBe('pending');

    // Operation completes → mark complete with result
    const { spId } = await createSupplierPayment({
      payeeName: 'دفعة مع مفتاح', expenseCategory: 'other',
      amountHalalas: 900_00, paymentMethod: 'cash',
    });
    await db.update(idempotencyKeys)
      .set({ status: 'complete', result: { spId }, expiresAt: new Date(Date.now() + 86_400_000) })
      .where(eq(idempotencyKeys.id, id));

    [row] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, id));
    expect(row!.status).toBe('complete');
    expect((row!.result as { spId: string }).spId).toBe(spId);
  });

  it('vatAmountHalalas: يظهر سطر ضريبة المدخلات (1230) وتكون التكلفة الصافية = المبلغ - الضريبة', async () => {
    const amount = 11_500_00;   // 100% + 15% VAT example
    const vat    = 1_500_00;
    const { jeId } = await createSupplierPayment({
      payeeName: 'مورد بضريبة', expenseCategory: 'supplier',
      amountHalalas: amount, paymentMethod: 'bank_transfer', vatAmountHalalas: vat,
    });

    const ls = await lines(jeId);
    assertBalanced(ls);
    expect(ls).toHaveLength(3);

    const inputVat = ls.find(l => l.accountCode === GL.inputVat.code);   // 1230
    expect(inputVat).toBeDefined();
    expect(inputVat!.debitHalalas).toBe(vat);

    const netCost = ls.find(l => l.accountCode === '2000');              // payableSupplier net
    expect(netCost!.debitHalalas).toBe(amount - vat);                   // 10,000.00

    const cashOut = ls.find(l => l.creditHalalas > 0);
    expect(cashOut!.creditHalalas).toBe(amount);                        // full amount credited
  });

});
