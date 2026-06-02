/**
 * Integration Tests — Invoice Counter & Journal Entry Balance
 *
 * Tests run against a real local PostgreSQL database.
 * Verifies:
 *  1. getNextJournalNumber returns sequential numbers for the same agency/year
 *  2. Numbers reset per year (JE-2024-* vs JE-2025-*)
 *  3. Journal entries written to DB satisfy DR = CR invariant
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import { agencies, agencyCounters, journalEntries, journalLines } from '@/lib/schema';
import { getNextJournalNumber, getNextReceiptNumber } from '@/lib/invoice-counter';

// ─── Test agency ──────────────────────────────────────────────────────────────

const AGENCY_ID = 'integ-test-invoice-counter-01';

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values({
    id:                 AGENCY_ID,
    nameAr:             'وكالة اختبار العداد',
    nameEn:             'Counter Test Agency',
    subscriptionStatus: 'active',
    isVatRegistered:    false,
  }).onConflictDoNothing();
});

afterAll(async () => {
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies        WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Invoice Counter Tests ────────────────────────────────────────────────────

describe('getNextJournalNumber — عداد القيود اليومية', () => {

  it('يُنتج الرقم الأول JE-2024-000001', async () => {
    const db = getTestDb();
    const num = await getNextJournalNumber(AGENCY_ID, 2024, db as never);
    expect(num).toBe('JE-2024-000001');
  });

  it('يُنتج الرقم الثاني JE-2024-000002 (تسلسلي)', async () => {
    const db = getTestDb();
    const num = await getNextJournalNumber(AGENCY_ID, 2024, db as never);
    expect(num).toBe('JE-2024-000002');
  });

  it('يُنتج الرقم الثالث JE-2024-000003', async () => {
    const db = getTestDb();
    const num = await getNextJournalNumber(AGENCY_ID, 2024, db as never);
    expect(num).toBe('JE-2024-000003');
  });

  it('يبدأ من جديد للسنة 2025 (عزل سنوي)', async () => {
    const db = getTestDb();
    const num2025 = await getNextJournalNumber(AGENCY_ID, 2025, db as never);
    expect(num2025).toBe('JE-2025-000001');
  });

  it('لا يؤثر عداد 2025 على تسلسل 2024', async () => {
    const db = getTestDb();
    const num2024 = await getNextJournalNumber(AGENCY_ID, 2024, db as never);
    expect(num2024).toBe('JE-2024-000004');
  });

  it('يحفظ العداد في جدول agency_counters بالمفتاح السنوي', async () => {
    const db = getTestDb();
    const rows = await db.select()
      .from(agencyCounters)
      .where(eq(agencyCounters.agencyId, AGENCY_ID));
    const keys = rows.map(r => r.counterType);
    expect(keys).toContain('journal-2024');
    expect(keys).toContain('journal-2025');
    // عداد 2024 يجب أن يكون 4 الآن
    const row2024 = rows.find(r => r.counterType === 'journal-2024');
    expect(row2024?.currentValue).toBe(4);
  });

});

describe('getNextReceiptNumber — عداد الإيصالات', () => {

  it('يُنتج الإيصال الأول RCT-2024-000001', async () => {
    const db = getTestDb();
    const num = await getNextReceiptNumber(AGENCY_ID, 2024, db as never);
    expect(num).toBe('RCT-2024-000001');
  });

  it('مستقل عن عداد القيود (لا تداخل بين أنواع العدادات)', async () => {
    const db = getTestDb();
    const num = await getNextReceiptNumber(AGENCY_ID, 2024, db as never);
    expect(num).toBe('RCT-2024-000002');
  });

});

// ─── Journal Entry Balance Tests ──────────────────────────────────────────────

describe('journal_entries — التحقق من توازن القيد (DR = CR)', () => {

  it('قيد يدوي متوازن: يحتفظ بـ totalDebitHalalas = totalCreditHalalas', async () => {
    const db = getTestDb();
    const entryId = `je-integ-balanced-${Date.now()}`;

    await db.insert(journalEntries).values({
      id:                 entryId,
      agencyId:           AGENCY_ID,
      entryNumber:        `JE-INTEG-001`,
      date:               '2024-03-15',
      descriptionAr:      'قيد اختبار متوازن',
      source:             'manual',
      isPosted:           true,
      totalDebitHalalas:  115_00,
      totalCreditHalalas: 115_00,
    });

    await db.insert(journalLines).values([
      {
        id: `jl-${entryId}-1`, entryId, agencyId: AGENCY_ID,
        accountCode: '1120', accountNameAr: 'ذمم مدينة',
        debitHalalas: 115_00, creditHalalas: 0, sortOrder: 1,
      },
      {
        id: `jl-${entryId}-2`, entryId, agencyId: AGENCY_ID,
        accountCode: '4000', accountNameAr: 'إيراد خدمات سفر',
        debitHalalas: 0, creditHalalas: 115_00, sortOrder: 2,
      },
    ]);

    const [entry] = await db.select().from(journalEntries)
      .where(eq(journalEntries.id, entryId));

    expect(entry).toBeDefined();
    expect(entry!.totalDebitHalalas).toBe(115_00);
    expect(entry!.totalCreditHalalas).toBe(115_00);
    expect(entry!.totalDebitHalalas).toBe(entry!.totalCreditHalalas);
  });

  it('سطور القيد: مجموع المدين = مجموع الدائن', async () => {
    const db = getTestDb();
    const entryId = `je-integ-lines-${Date.now()}`;

    await db.insert(journalEntries).values({
      id: entryId, agencyId: AGENCY_ID, entryNumber: 'JE-INTEG-002',
      date: '2024-03-20', source: 'manual', isPosted: true,
      totalDebitHalalas: 200_00, totalCreditHalalas: 200_00,
    });

    await db.insert(journalLines).values([
      {
        id: `jl-${entryId}-1`, entryId, agencyId: AGENCY_ID,
        accountCode: '6100', accountNameAr: 'مصاريف تشغيلية',
        debitHalalas: 200_00, creditHalalas: 0, sortOrder: 1,
      },
      {
        id: `jl-${entryId}-2`, entryId, agencyId: AGENCY_ID,
        accountCode: '1100', accountNameAr: 'نقدية وبنوك',
        debitHalalas: 0, creditHalalas: 200_00, sortOrder: 2,
      },
    ]);

    const lines = await db.select().from(journalLines)
      .where(eq(journalLines.entryId, entryId));

    const totalDR = lines.reduce((s, l) => s + l.debitHalalas,  0);
    const totalCR = lines.reduce((s, l) => s + l.creditHalalas, 0);
    expect(totalDR).toBe(totalCR);
    expect(totalDR).toBe(200_00);
  });

  it('حذف القيد يحذف سطوره تلقائياً (ON DELETE CASCADE)', async () => {
    const db = getTestDb();
    const entryId = `je-integ-cascade-${Date.now()}`;

    await db.insert(journalEntries).values({
      id: entryId, agencyId: AGENCY_ID, entryNumber: 'JE-INTEG-003',
      date: '2024-04-01', source: 'manual', isPosted: true,
      totalDebitHalalas: 50_00, totalCreditHalalas: 50_00,
    });

    await db.insert(journalLines).values([
      {
        id: `jl-${entryId}-1`, entryId, agencyId: AGENCY_ID,
        accountCode: '1120', debitHalalas: 50_00, creditHalalas: 0, sortOrder: 1,
      },
      {
        id: `jl-${entryId}-2`, entryId, agencyId: AGENCY_ID,
        accountCode: '4000', debitHalalas: 0, creditHalalas: 50_00, sortOrder: 2,
      },
    ]);

    // حذف القيد الرئيسي
    await sql(`DELETE FROM journal_entries WHERE id = '${entryId}'`);

    // يجب أن تختفي السطور أيضاً
    const remaining = await db.select().from(journalLines)
      .where(eq(journalLines.entryId, entryId));
    expect(remaining).toHaveLength(0);
  });

  it('قيد بسطر واحد (قيمة صفر) مقبول في قاعدة البيانات', async () => {
    const db = getTestDb();
    const entryId = `je-integ-zero-${Date.now()}`;

    await db.insert(journalEntries).values({
      id: entryId, agencyId: AGENCY_ID, entryNumber: 'JE-INTEG-004',
      date: '2024-05-01', source: 'manual', isPosted: true,
      totalDebitHalalas: 0, totalCreditHalalas: 0,
    });

    await db.insert(journalLines).values([
      {
        id: `jl-${entryId}-1`, entryId, agencyId: AGENCY_ID,
        accountCode: '1110', debitHalalas: 0, creditHalalas: 0, sortOrder: 1,
      },
    ]);

    const [entry] = await db.select().from(journalEntries)
      .where(eq(journalEntries.id, entryId));
    expect(entry).toBeDefined();
    expect(entry!.totalDebitHalalas).toBe(0);
  });

});
