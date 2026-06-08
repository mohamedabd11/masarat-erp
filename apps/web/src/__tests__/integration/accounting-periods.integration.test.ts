/**
 * Integration Tests — Accounting Period Lock
 *
 * Tests run against a real local PostgreSQL database.
 * Verifies that assertPeriodOpen correctly blocks/allows posting
 * depending on whether the period is locked in the DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql , SKIP_IF_NO_DB } from './test-db';
import { agencies, accountingPeriods } from '@/lib/schema';
import { assertPeriodOpen } from '@/lib/period-lock';
import { BusinessError } from '@/lib/api-auth';

// ─── Test agency ──────────────────────────────────────────────────────────────
// Fixed ID so cleanup is reliable — unique per test file to avoid collisions.

const AGENCY_ID = 'integ-test-acctg-periods-01';

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  await db.insert(agencies).values({
    id:                 AGENCY_ID,
    nameAr:             'وكالة اختبار الفترات',
    nameEn:             'Period Lock Test Agency',
    subscriptionStatus: 'active',
    isVatRegistered:    false,
  }).onConflictDoNothing();
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM accounting_periods WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies WHERE id = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertPeriod(year: number, month: number, isLocked: boolean) {
  const db = getTestDb();
  await db.insert(accountingPeriods).values({
    id:          `${AGENCY_ID}-${year}-${month}`,
    agencyId:    AGENCY_ID,
    periodYear:  year,
    periodMonth: month,
    isLocked,
  }).onConflictDoNothing();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP_IF_NO_DB)('assertPeriodOpen — قاعدة بيانات حقيقية', () => {

  it('يسمح بالنشر في فترة مفتوحة (isLocked = false)', async () => {
    const db = getTestDb();
    await insertPeriod(2024, 3, false);
    await expect(
      assertPeriodOpen(AGENCY_ID, '2024-03-15', db as never),
    ).resolves.toBeUndefined();
  });

  it('يرفض النشر في فترة مقفلة (isLocked = true) بـ BusinessError 422', async () => {
    const db = getTestDb();
    await insertPeriod(2024, 2, true);
    await expect(
      assertPeriodOpen(AGENCY_ID, '2024-02-10', db as never),
    ).rejects.toThrow(BusinessError);
  });

  it('رمز الحالة 422 للفترة المقفلة', async () => {
    const db = getTestDb();
    await insertPeriod(2024, 1, true);
    try {
      await assertPeriodOpen(AGENCY_ID, '2024-01-20', db as never);
      expect.fail('يجب أن يرمي خطأ');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessError);
      expect((e as BusinessError).status).toBe(422);
    }
  });

  it('رسالة الخطأ تحتوي على السنة والشهر (2024/02)', async () => {
    const db = getTestDb();
    try {
      await assertPeriodOpen(AGENCY_ID, '2024-02-15', db as never);
    } catch (e) {
      expect((e as BusinessError).message).toMatch(/2024\/02/);
    }
  });

  it('يسمح بالنشر في فترة غير موجودة في DB (لم تُقفل بعد)', async () => {
    const db = getTestDb();
    // فترة 2025-06 غير موجودة في الجدول — يجب السماح
    await expect(
      assertPeriodOpen(AGENCY_ID, '2025-06-01', db as never),
    ).resolves.toBeUndefined();
  });

  it('يُهمل التاريخ المشوّه ويُكمل بدون رمي خطأ', async () => {
    const db = getTestDb();
    await expect(
      assertPeriodOpen(AGENCY_ID, 'not-a-date', db as never),
    ).resolves.toBeUndefined();
  });

  it('يمكن فتح فترة مقفلة وإعادة نشر قيود فيها', async () => {
    const db = getTestDb();
    // أقفل الفترة
    await insertPeriod(2024, 4, true);
    await expect(assertPeriodOpen(AGENCY_ID, '2024-04-10', db as never)).rejects.toThrow();

    // افتح الفترة
    await db.update(accountingPeriods)
      .set({ isLocked: false })
      .where(and(
        eq(accountingPeriods.agencyId, AGENCY_ID),
        eq(accountingPeriods.periodYear, 2024),
        eq(accountingPeriods.periodMonth, 4),
      ));

    // الآن يجب أن يسمح
    await expect(assertPeriodOpen(AGENCY_ID, '2024-04-10', db as never)).resolves.toBeUndefined();
  });

});

describe.skipIf(SKIP_IF_NO_DB)('accounting_periods — عزل البيانات بين الوكالات', () => {

  it('قفل فترة في وكالة لا يؤثر على وكالة أخرى', async () => {
    const db = getTestDb();
    const OTHER_AGENCY = 'integ-test-acctg-other-01';

    // أنشئ وكالة ثانية
    await db.insert(agencies).values({
      id: OTHER_AGENCY, nameAr: 'وكالة أخرى', subscriptionStatus: 'active', isVatRegistered: false,
    }).onConflictDoNothing();

    // اقفل 2024/05 للوكالة الأولى فقط
    await db.insert(accountingPeriods).values({
      id: `${AGENCY_ID}-2024-5`, agencyId: AGENCY_ID, periodYear: 2024, periodMonth: 5, isLocked: true,
    }).onConflictDoNothing();

    // الوكالة الأولى: مقفلة ❌
    await expect(assertPeriodOpen(AGENCY_ID, '2024-05-01', db as never)).rejects.toThrow();

    // الوكالة الثانية: لا يوجد سجل → مفتوحة ✅
    await expect(assertPeriodOpen(OTHER_AGENCY, '2024-05-01', db as never)).resolves.toBeUndefined();

    // تنظيف
    await sql(`DELETE FROM accounting_periods WHERE agency_id = '${OTHER_AGENCY}'`);
    await sql(`DELETE FROM agencies WHERE id = '${OTHER_AGENCY}'`);
  });

});
