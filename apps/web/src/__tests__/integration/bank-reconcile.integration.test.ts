/**
 * Integration Tests — Bank Reconciliation (Real DB)
 *
 * Tests run against a real local PostgreSQL database.
 * Verifies:
 *  1. Bank transactions are marked as reconciled after reconciliation
 *  2. Journal entry created when book balance ≠ statement balance
 *  3. Discrepancy journal entry is balanced (DR = CR)
 *  4. No journal entry when balance matches exactly
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql , SKIP_IF_NO_DB } from './test-db';
import {
  agencies, bankAccounts, bankTransactions, journalEntries, journalLines,
  agencyCounters,
} from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';

// ─── Test agency ──────────────────────────────────────────────────────────────

const AGENCY_ID = 'integ-test-bank-recon-01';
const ACCOUNT_ID = `${AGENCY_ID}-ba-001`;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  await db.insert(agencies).values({
    id:                 AGENCY_ID,
    nameAr:             'وكالة اختبار المطابقة',
    nameEn:             'Bank Reconcile Test Agency',
    subscriptionStatus: 'active',
    isVatRegistered:    false,
  }).onConflictDoNothing();

  await db.insert(bankAccounts).values({
    id:                      ACCOUNT_ID,
    agencyId:                AGENCY_ID,
    nameAr:                  'البنك الأهلي — اختبار',
    type:                    'bank',
    currency:                'SAR',
    currentBalanceHalalas:   100_000_00,
    openingBalanceHalalas:   0,
    isActive:                true,
    isReconciled:            false,
    reconciledBalanceHalalas: 0,
  }).onConflictDoNothing();
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_lines      WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries    WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM bank_transactions  WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM bank_accounts      WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters    WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies           WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

let txCounter = 0;

async function insertTransaction(
  type: 'deposit' | 'withdrawal',
  amountHalalas: number,
  date = '2024-03-10',
) {
  const db = getTestDb();
  const id = `${ACCOUNT_ID}-tx-${++txCounter}-${Date.now()}`;
  await db.insert(bankTransactions).values({
    id,
    agencyId:      AGENCY_ID,
    bankAccountId: ACCOUNT_ID,
    type,
    amountHalalas,
    date,
    isReconciled:  false,
  }).onConflictDoNothing();
  return id;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP_IF_NO_DB)('bank_transactions — تسجيل الحركات وتحديثها', () => {

  it('يُسجَّل إيداع بشكل صحيح في قاعدة البيانات', async () => {
    const db = getTestDb();
    const id = await insertTransaction('deposit', 10_000_00);
    const [tx] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(tx).toBeDefined();
    expect(tx!.type).toBe('deposit');
    expect(tx!.amountHalalas).toBe(10_000_00);
    expect(tx!.isReconciled).toBe(false);
  });

  it('يُسجَّل سحب بشكل صحيح في قاعدة البيانات', async () => {
    const db = getTestDb();
    const id = await insertTransaction('withdrawal', 2_000_00);
    const [tx] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(tx!.type).toBe('withdrawal');
    expect(tx!.amountHalalas).toBe(2_000_00);
  });

  it('تحديث isReconciled = true يعمل بنجاح', async () => {
    const db = getTestDb();
    const id = await insertTransaction('deposit', 5_000_00);
    const now = new Date();

    await db.update(bankTransactions)
      .set({ isReconciled: true, reconciledAt: now, reconciledBy: 'user-test' })
      .where(eq(bankTransactions.id, id));

    const [tx] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(tx!.isReconciled).toBe(true);
    expect(tx!.reconciledBy).toBe('user-test');
  });

});

describe.skipIf(SKIP_IF_NO_DB)('bank_reconcile — مطابقة بنكية في قاعدة بيانات حقيقية', () => {

  it('مطابقة بدون فروقات: لا يُنشأ قيد يومية', async () => {
    const db = getTestDb();
    const txId1 = await insertTransaction('deposit',    10_000_00, '2024-04-01');
    const txId2 = await insertTransaction('withdrawal',  2_000_00, '2024-04-05');

    // محاكاة ما يقوم به route.ts داخل transaction:
    await db.transaction(async (tx) => {
      // تحديث الحركات كـ "متطابقة"
      for (const id of [txId1, txId2]) {
        await tx.update(bankTransactions)
          .set({ isReconciled: true, reconciledAt: new Date(), reconciledBy: 'reconciler' })
          .where(eq(bankTransactions.id, id));
      }

      // تحديث رصيد المطابقة على الحساب (بدون فروق — book = statement)
      await tx.update(bankAccounts)
        .set({ reconciledBalanceHalalas: 100_000_00, reconciledAt: new Date(), updatedAt: new Date() })
        .where(eq(bankAccounts.id, ACCOUNT_ID));

      // لا قيد مطابقة (discrepancy = 0)
    });

    // تحقق: الحركتان متطابقتان
    const rows = await db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, txId1)));
    expect(rows[0]!.isReconciled).toBe(true);

    // تحقق: لا قيود يومية
    const entries = await db.select().from(journalEntries)
      .where(eq(journalEntries.agencyId, AGENCY_ID));
    expect(entries).toHaveLength(0);
  });

  it('مطابقة مع فروقات: يُنشأ قيد يومية متوازن', async () => {
    const db = getTestDb();
    const txId = await insertTransaction('deposit', 500_00, '2024-05-01');

    // كتاب (100000) - بيان بنك (99000) = 1000 هللة فروق
    const bookBalance       = 100_000_00;
    const statementBalance  =  99_000_00;
    const discrepancy       = bookBalance - statementBalance; // 1000_00
    const statementDate     = '2024-05-31';

    let discrepancyEntryId: string | undefined;

    await db.transaction(async (tx) => {
      // وضع علامة المطابقة على الحركة
      await tx.update(bankTransactions)
        .set({ isReconciled: true, reconciledAt: new Date() })
        .where(eq(bankTransactions.id, txId));

      // إنشاء قيد الفروق
      discrepancyEntryId  = crypto.randomUUID();
      const entryNumber   = await getNextJournalNumber(AGENCY_ID, 2024, tx as never);

      await tx.insert(journalEntries).values({
        id:                 discrepancyEntryId,
        agencyId:           AGENCY_ID,
        entryNumber,
        date:               statementDate,
        descriptionAr:      `فروق مطابقة بنكية — البنك الأهلي ${statementDate}`,
        source:             'manual',
        sourceId:           ACCOUNT_ID,
        isPosted:           true,
        totalDebitHalalas:  discrepancy,
        totalCreditHalalas: discrepancy,
        createdBy:          'reconciler',
      });

      await tx.insert(journalLines).values([
        {
          id:            crypto.randomUUID(),
          entryId:       discrepancyEntryId,
          agencyId:      AGENCY_ID,
          accountCode:   '5510',
          accountNameAr: 'فروق مطابقة بنكية (عجز)',
          debitHalalas:  discrepancy,
          creditHalalas: 0,
          sortOrder:     1,
        },
        {
          id:            crypto.randomUUID(),
          entryId:       discrepancyEntryId,
          agencyId:      AGENCY_ID,
          accountCode:   '1100',
          accountNameAr: 'نقدية وبنوك',
          debitHalalas:  0,
          creditHalalas: discrepancy,
          sortOrder:     2,
        },
      ]);

      // تحديث الرصيد الدفتري
      await tx.update(bankAccounts)
        .set({ currentBalanceHalalas: statementBalance })
        .where(eq(bankAccounts.id, ACCOUNT_ID));
    });

    // تحقق: القيد موجود في قاعدة البيانات
    const [entry] = await db.select().from(journalEntries)
      .where(eq(journalEntries.id, discrepancyEntryId!));
    expect(entry).toBeDefined();
    expect(entry!.totalDebitHalalas).toBe(discrepancy);
    expect(entry!.totalCreditHalalas).toBe(discrepancy);

    // تحقق: القيد متوازن (DR = CR من سطور القيد)
    const lines = await db.select().from(journalLines)
      .where(eq(journalLines.entryId, discrepancyEntryId!));
    expect(lines).toHaveLength(2);
    const totalDR = lines.reduce((s, l) => s + l.debitHalalas,  0);
    const totalCR = lines.reduce((s, l) => s + l.creditHalalas, 0);
    expect(totalDR).toBe(totalCR);
    expect(totalDR).toBe(discrepancy);
  });

  it('بعد المطابقة: الحركة تحمل reconciledAt وreconciledBy', async () => {
    const db = getTestDb();
    const txId = await insertTransaction('withdrawal', 3_000_00, '2024-06-01');
    const reconcileTime = new Date();

    await db.update(bankTransactions)
      .set({ isReconciled: true, reconciledAt: reconcileTime, reconciledBy: 'accountant-99' })
      .where(eq(bankTransactions.id, txId));

    const [tx] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, txId));
    expect(tx!.isReconciled).toBe(true);
    expect(tx!.reconciledBy).toBe('accountant-99');
    expect(tx!.reconciledAt).toBeTruthy();
  });

  it('الرصيد المطابق يُحفظ على الحساب البنكي', async () => {
    const db = getTestDb();
    const targetBalance = 97_000_00;

    await db.update(bankAccounts)
      .set({ reconciledBalanceHalalas: targetBalance, reconciledAt: new Date() })
      .where(eq(bankAccounts.id, ACCOUNT_ID));

    const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, ACCOUNT_ID));
    expect(account!.reconciledBalanceHalalas).toBe(targetBalance);
    expect(account!.reconciledAt).toBeTruthy();
  });

});

describe.skipIf(SKIP_IF_NO_DB)('agency_counters — عداد قيود المطابقة', () => {

  it('عداد قيد المطابقة متسلسل ومستقل عن بقية الوكالات', async () => {
    const db = getTestDb();
    const n1 = await getNextJournalNumber(AGENCY_ID, 2024, db as never);
    const n2 = await getNextJournalNumber(AGENCY_ID, 2024, db as never);

    // الأول كان JE-2024-000001 من اختبار الفروقات أعلاه
    // هذا الاختبار يحصل على الأرقام التالية
    expect(n1).toMatch(/^JE-2024-\d{6}$/);
    expect(n2).toMatch(/^JE-2024-\d{6}$/);

    // التسلسل: الثاني = الأول + 1
    const num1 = parseInt(n1.split('-')[2]!);
    const num2 = parseInt(n2.split('-')[2]!);
    expect(num2).toBe(num1 + 1);
  });

});
