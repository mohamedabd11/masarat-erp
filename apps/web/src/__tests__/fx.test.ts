import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fxToHalalas } from '@/lib/fx';

// ─── fxToHalalas ──────────────────────────────────────────────────────────────
// Formula: halalas = Math.round(foreignAmountMinor × storedRate / 10000)
// storedRate = actual_rate × 10000
// e.g. USD/SAR 3.75 → storedRate = 37500

describe('fxToHalalas — تحويل العملات إلى هللات', () => {

  // ── 1. $1 (100 cents) × 3.75 rate → 375 halalas ──────────────────────────

  it('100 سنت دولار × معدل 37500 = 375 هللة (1 دولار = 3.75 ريال)', () => {
    // 100 cents × 37500 / 10000 = 375
    expect(fxToHalalas(100, 37500)).toBe(375);
  });

  // ── 2. 1000 AED × rate ≈ 1.0204 → correct halalas ─────────────────────────

  it('100000 فلس درهم × معدل 10204 ≈ هللات صحيحة', () => {
    // 100000 fils (1000 AED) × 10204 / 10000 = Math.round(102040) = 102040
    expect(fxToHalalas(100000, 10204)).toBe(102040);
  });

  // ── 3. Zero amount → 0 ────────────────────────────────────────────────────

  it('مبلغ صفر → صفر هللة', () => {
    expect(fxToHalalas(0, 37500)).toBe(0);
    expect(fxToHalalas(0, 10000)).toBe(0);
  });

  // ── 4. Large amount stays within safe integer range ───────────────────────

  it('مبالغ كبيرة تبقى ضمن نطاق الأعداد الصحيحة الآمنة', () => {
    // 10,000,000 cents (100,000 USD) × 37500 / 10000 = 37,500,000 halalas (375,000 SAR)
    const result = fxToHalalas(10_000_000, 37500);
    expect(result).toBe(37_500_000);
    expect(result).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  // ── 5. Fractional result gets rounded ─────────────────────────────────────

  it('النتيجة الكسرية تُقرَّب باستخدام Math.round', () => {
    // 1 cent × 37500 / 10000 = 3.75 → rounds to 4
    expect(fxToHalalas(1, 37500)).toBe(4);
  });

  it('النتيجة الكسرية تُقرَّب للأسفل عند 0.4', () => {
    // 2 cents × 37500 / 10000 = 7.5 → rounds to 8
    expect(fxToHalalas(2, 37500)).toBe(8);
  });

  // ── 6. Rate = 10000 (1:1) → foreignMinor === halalas ─────────────────────

  it('معدل 10000 (1:1) → المبلغ الأجنبي يساوي الهللات', () => {
    expect(fxToHalalas(500, 10000)).toBe(500);
    expect(fxToHalalas(99999, 10000)).toBe(99999);
  });

  // ── 7. $100 (10000 cents) at 3.75 → 37500 halalas ────────────────────────

  it('100 دولار (10000 سنت) × معدل 37500 = 37500 هللة (375 ريال)', () => {
    // 10000 cents × 37500 / 10000 = 37500 halalas = 375 SAR
    expect(fxToHalalas(10000, 37500)).toBe(37500);
  });

  // ── 8. EUR/SAR ≈ 4.0: €0.01 = 4 halalas ─────────────────────────────────

  it('€0.01 (1 سنت يورو) × معدل 40000 (4.0) = 4 هللات', () => {
    // 1 eurocent × 40000 / 10000 = 4 halalas
    expect(fxToHalalas(1, 40000)).toBe(4);
  });

  it('€1.00 (100 سنت يورو) × معدل 40000 (4.0) = 400 هللة', () => {
    // 100 eurocentss × 40000 / 10000 = 400 halalas = 4 SAR
    expect(fxToHalalas(100, 40000)).toBe(400);
  });

  // ── Additional edge cases ─────────────────────────────────────────────────

  it('معدل منخفض جداً: 1 → نتيجة صحيحة', () => {
    // 10000 minor × 1 / 10000 = 1
    expect(fxToHalalas(10000, 1)).toBe(1);
  });

  it('النتيجة دائماً عدد صحيح (لا كسور)', () => {
    const result = fxToHalalas(3, 37500);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─── lookupFxRate — mocked DB ─────────────────────────────────────────────────
// We test the DB query logic by mocking the chain

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/schema', () => ({
  exchangeRates: {
    agencyId: 'agencyId',
    fromCurrency: 'fromCurrency',
    toCurrency: 'toCurrency',
    effectiveDate: 'effectiveDate',
    rate: 'rate',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => ({ args })),
  lte: vi.fn((col, val) => ({ col, val })),
  desc: vi.fn((col) => ({ col })),
}));

import { lookupFxRate } from '@/lib/fx';

describe('lookupFxRate — البحث عن سعر الصرف', () => {

  function makeMockDb(rows: Record<string, unknown>[]) {
    return {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
  }

  it('يُعيد null إذا لم يُوجد معدل صرف', async () => {
    const mockDb = makeMockDb([]);
    const result = await lookupFxRate('agency-1', 'USD', 'SAR', '2024-03-15', mockDb as never);
    expect(result).toBeNull();
  });

  it('يُعيد storedRate و effectiveDate عند وجود صف', async () => {
    const mockDb = makeMockDb([{ storedRate: 37500, effectiveDate: '2024-01-01' }]);
    const result = await lookupFxRate('agency-1', 'USD', 'SAR', '2024-03-15', mockDb as never);
    expect(result).toEqual({ storedRate: 37500, effectiveDate: '2024-01-01' });
  });

  it('يُحوّل رمز العملة إلى أحرف كبيرة', async () => {
    const mockDb = makeMockDb([{ storedRate: 10000, effectiveDate: '2024-01-01' }]);
    const result = await lookupFxRate('agency-1', 'usd', 'sar', '2024-03-15', mockDb as never);
    expect(result).not.toBeNull();
    expect(mockDb.limit).toHaveBeenCalledWith(1);
  });

  it('يُعيد تمرير خطأ قاعدة البيانات', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    await expect(
      lookupFxRate('agency-1', 'USD', 'SAR', '2024-03-15', chain as never)
    ).rejects.toThrow('DB error');
  });
});
