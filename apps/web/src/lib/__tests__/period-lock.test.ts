import { describe, it, expect, vi } from 'vitest';

// Mock @/lib/db to prevent any real DB connection attempt at module load
vi.mock('@/lib/db', () => ({
  db: { transaction: vi.fn() },
}));

import { assertPeriodOpen } from '@/lib/period-lock';

// Build a stub transaction/db that returns the given rows for any query
function makeStubTx(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  };
}

describe('assertPeriodOpen', () => {
  it('does not throw when no period record exists (open by default)', async () => {
    const tx = makeStubTx([]);  // empty → no locked record
    await expect(
      assertPeriodOpen('agency-1', '2025-03-15', tx as never),
    ).resolves.toBeUndefined();
  });

  it('does not throw when period record exists but is unlocked', async () => {
    const tx = makeStubTx([{ isLocked: false, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2025-03-15', tx as never),
    ).resolves.toBeUndefined();
  });

  it('throws Arabic error when period is locked', async () => {
    const tx = makeStubTx([{ isLocked: true, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2025-03-15', tx as never),
    ).rejects.toThrow('الفترة المحاسبية 2025/03 مقفلة');
  });

  it('includes notes in the error when period is locked with notes', async () => {
    const tx = makeStubTx([{ isLocked: true, notes: 'مراجعة سنوية' }]);
    await expect(
      assertPeriodOpen('agency-1', '2024-12-31', tx as never),
    ).rejects.toThrow('مراجعة سنوية');
  });

  it('includes the period label YYYY/MM in the error message', async () => {
    const tx = makeStubTx([{ isLocked: true, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2024-06-01', tx as never),
    ).rejects.toThrow('2024/06');
  });

  it('does not throw for malformed date (lets DB handle it)', async () => {
    const tx = makeStubTx([]);
    await expect(
      assertPeriodOpen('agency-1', 'not-a-date', tx as never),
    ).resolves.toBeUndefined();
  });

  it('handles year boundary: December locked → throws', async () => {
    const tx = makeStubTx([{ isLocked: true, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2024-12-31', tx as never),
    ).rejects.toThrow('2024/12');
  });

  it('handles year boundary: January open → no throw', async () => {
    const tx = makeStubTx([{ isLocked: false, notes: null }]);
    await expect(
      assertPeriodOpen('agency-1', '2025-01-01', tx as never),
    ).resolves.toBeUndefined();
  });
});
