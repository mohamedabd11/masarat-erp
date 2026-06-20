import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessError } from '@/lib/api-auth';

// ─── Mock the DB and schema ────────────────────────────────────────────────────

// We must mock @/lib/db before importing assertPeriodOpen because the module
// resolves the db import at load time.
vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/schema', () => ({
  accountingPeriods: {
    agencyId: 'agencyId',
    periodYear: 'periodYear',
    periodMonth: 'periodMonth',
    isLocked: 'isLocked',
    notes: 'notes',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  desc: vi.fn((col) => ({ col, op: 'desc' })),
}));

// ─── Setup a chainable mock query builder ─────────────────────────────────────
// Both the explicit-period lookup and the MED-1 "latest locked period" lookup
// resolve through .limit(1) to returnRows; the second query (no explicit row) sees
// [] for these tests, so the implicit-lock branch is a no-op.

function makeMockDb(returnRows: Record<string, unknown>[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnRows),
  };
  return chain;
}

import { assertPeriodOpen } from '@/lib/period-lock';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('assertPeriodOpen', () => {

  // ── 1. No period row → no throw ───────────────────────────────────────────

  it('لا يرمي خطأ إذا لم يُوجد صف للفترة (مفتوحة بشكل افتراضي)', async () => {
    const mockDb = makeMockDb([]);
    await expect(
      assertPeriodOpen('agency-1', '2024-03-15', mockDb as never)
    ).resolves.toBeUndefined();
  });

  // ── 2. Period row with isLocked = false → no throw ────────────────────────

  it('لا يرمي خطأ إذا كانت الفترة موجودة وغير مقفلة', async () => {
    const mockDb = makeMockDb([{ isLocked: false, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2024-03-15', mockDb as never)
    ).resolves.toBeUndefined();
  });

  // ── 3. Period row with isLocked = true → throws BusinessError 422 ─────────

  it('يرمي BusinessError بحالة 422 إذا كانت الفترة مقفلة', async () => {
    const mockDb = makeMockDb([{ isLocked: true, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2024-03-15', mockDb as never)
    ).rejects.toThrow(BusinessError);
  });

  it('رمز الحالة هو 422 (وليس 423) للفترة المقفلة', async () => {
    const mockDb = makeMockDb([{ isLocked: true, notes: null }]);
    try {
      await assertPeriodOpen('agency-1', '2024-03-15', mockDb as never);
      expect.fail('Expected BusinessError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessError);
      expect((e as BusinessError).status).toBe(422);
    }
  });

  it('رسالة الخطأ تحتوي على التسمية العربية للفترة', async () => {
    const mockDb = makeMockDb([{ isLocked: true, notes: null }]);
    try {
      await assertPeriodOpen('agency-1', '2024-03-15', mockDb as never);
      expect.fail('Expected BusinessError to be thrown');
    } catch (e) {
      expect((e as BusinessError).message).toContain('2024/03');
    }
  });

  it('رسالة الخطأ تحتوي على الملاحظات إذا كانت موجودة', async () => {
    const mockDb = makeMockDb([{ isLocked: true, notes: 'تدقيق سنوي' }]);
    try {
      await assertPeriodOpen('agency-1', '2024-03-15', mockDb as never);
      expect.fail('Expected BusinessError to be thrown');
    } catch (e) {
      expect((e as BusinessError).message).toContain('تدقيق سنوي');
    }
  });

  // ── 4. Date parsing: 2024-03-15 → year=2024, month=3 ──────────────────────

  it('يحلل تاريخ 2024-03-15 إلى year=2024 month=3 بشكل صحيح', async () => {
    const mockDb = makeMockDb([]);
    await assertPeriodOpen('agency-1', '2024-03-15', mockDb as never);
    // Verify query was executed (limit was called → chain completed)
    expect(mockDb.limit).toHaveBeenCalledWith(1);
  });

  // ── 5. Date parsing: 2024-01-01 → year=2024, month=1 ─────────────────────

  it('يحلل تاريخ 2024-01-01 إلى year=2024 month=1', async () => {
    const mockDb = makeMockDb([]);
    await assertPeriodOpen('agency-2', '2024-01-01', mockDb as never);
    expect(mockDb.limit).toHaveBeenCalledWith(1);
  });

  // ── 6. Date parsing: 2023-12-31 → year=2023, month=12 ────────────────────

  it('يحلل تاريخ 2023-12-31 إلى year=2023 month=12', async () => {
    const mockDb = makeMockDb([]);
    await assertPeriodOpen('agency-1', '2023-12-31', mockDb as never);
    expect(mockDb.limit).toHaveBeenCalledWith(1);
  });

  // ── 7. Invalid date string → handles gracefully ───────────────────────────

  it('يرفض تاريخاً مشوهاً fail-closed (MED-1) دون استعلام DB', async () => {
    const mockDb = makeMockDb([]);
    // MED-1: a malformed date must NOT silently pass as "period open" — it
    // fail-closes with a BusinessError before touching the DB.
    await expect(
      assertPeriodOpen('agency-1', 'not-a-date', mockDb as never)
    ).rejects.toThrow('تاريخ غير صالح');
    expect(mockDb.limit).not.toHaveBeenCalled();
  });

  it('يرفض تاريخاً فارغاً fail-closed (MED-1)', async () => {
    const mockDb = makeMockDb([]);
    await expect(
      assertPeriodOpen('agency-1', '', mockDb as never)
    ).rejects.toThrow('تاريخ غير صالح');
    expect(mockDb.limit).not.toHaveBeenCalled();
  });

  // ── MED-1: implicit lock for months at/before the latest locked period ────

  it('يقفل ضمنياً شهراً قبل أحدث فترة مقفلة دون صف صريح (MED-1)', async () => {
    // explicit lookup → [] (no row), latest-locked lookup → 2024/06 locked.
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ y: 2024, m: 6 }]),
    };
    await expect(
      assertPeriodOpen('agency-1', '2024-03-15', chain as never),
    ).rejects.toThrow(BusinessError);
  });

  it('لا يقفل شهراً بعد أحدث فترة مقفلة (MED-1)', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ y: 2024, m: 1 }]),
    };
    // target 2024/03 is AFTER the latest locked 2024/01 → still open
    await expect(
      assertPeriodOpen('agency-1', '2024-03-15', chain as never),
    ).resolves.toBeUndefined();
  });

  // ── 8. DB error → propagates ──────────────────────────────────────────────

  it('يُعيد تمرير خطأ قاعدة البيانات إذا حدث خطأ', async () => {
    const dbError = new Error('connection timeout');
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(dbError),
    };
    await expect(
      assertPeriodOpen('agency-1', '2024-03-15', chain as never)
    ).rejects.toThrow('connection timeout');
  });
});
