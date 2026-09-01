import { describe, expect, it } from 'vitest';
import {
  calculateHierarchyLevels,
  descendantIds,
  flattenAccountTree,
  parseReportDepth,
  rollupAccountAmounts,
  rollupTrialBalance,
  type CoaHierarchyAccount,
} from '@/lib/coa-hierarchy';

const accounts: CoaHierarchyAccount[] = [
  { id: 'a', code: '1', nameAr: 'الأصول', nameEn: 'Assets', type: 'asset', parentId: null, level: 1, allowDirectEntry: false },
  { id: 'b', code: '11', nameAr: 'متداولة', nameEn: 'Current', type: 'asset', parentId: 'a', level: 2, allowDirectEntry: false },
  { id: 'c', code: '111', nameAr: 'نقدية', nameEn: 'Cash', type: 'asset', parentId: 'b', level: 3, allowDirectEntry: false },
  { id: 'd', code: '112', nameAr: 'بنك', nameEn: 'Bank', type: 'asset', parentId: 'b', level: 3, allowDirectEntry: true },
  { id: 'e', code: '1111', nameAr: 'صندوق', nameEn: 'Till', type: 'asset', parentId: 'c', level: 4, allowDirectEntry: true },
];

describe('chart-of-accounts hierarchy', () => {
  it('calculates levels and finds descendants', () => {
    expect(Object.fromEntries(calculateHierarchyLevels(accounts))).toMatchObject({ a: 1, b: 2, c: 3, d: 3, e: 4 });
    expect([...descendantIds(accounts, 'b')].sort()).toEqual(['c', 'd', 'e']);
    expect(flattenAccountTree([...accounts].reverse()).map(a => a.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('rejects cycles, cross-type parents, posting parents, and inactive parents', () => {
    expect(() => calculateHierarchyLevels(accounts.map(a => a.id === 'a' ? { ...a, parentId: 'b' } : a))).toThrow(/دورة/);
    expect(() => calculateHierarchyLevels([...accounts, {
      id: 'x', code: '2', nameAr: 'التزامات', nameEn: 'Liabilities', type: 'liability' as const,
      parentId: 'a', level: 2, allowDirectEntry: true,
    }])).toThrow(/نفس النوع/);
    expect(() => calculateHierarchyLevels(accounts.map(a => a.id === 'b' ? { ...a, allowDirectEntry: true } : a))).toThrow(/تجميعياً/);
    expect(() => calculateHierarchyLevels(accounts.map(a => a.id === 'b' ? { ...a, isActive: false } : a))).toThrow(/غير نشط/);
  });

  it('rolls descendants into level 3 while all keeps level 4 visible', () => {
    const direct = new Map([['1111', 400], ['112', 600]]);
    const level3 = rollupAccountAmounts(accounts, direct, 3);
    expect(level3.find(r => r.code === '1')?.amount).toBe(1_000);
    expect(level3.find(r => r.code === '111')?.amount).toBe(400);
    expect(level3.some(r => r.code === '1111')).toBe(false);
    expect(rollupAccountAmounts(accounts, direct, 'all').find(r => r.code === '1111')?.amount).toBe(400);
  });

  it('rolls every trial-balance column without changing the debit/credit equation', () => {
    const direct = new Map([['1111', {
      openDebit: 100, openCredit: 0, periodDebit: 300, periodCredit: 50, totalDebit: 400, totalCredit: 50,
    }]]);
    const rows = rollupTrialBalance(accounts, direct, 3);
    expect(rows.find(r => r.code === '111')).toMatchObject({ totalDebit: 400, totalCredit: 50 });
    expect(rows.find(r => r.code === '1')).toMatchObject({ totalDebit: 400, totalCredit: 50 });
  });

  it('uses level 3 by default and accepts level 4/all', () => {
    expect(parseReportDepth(null)).toBe(3);
    expect(parseReportDepth('4')).toBe(4);
    expect(parseReportDepth('all')).toBe('all');
    expect(parseReportDepth('99')).toBe(3);
  });
});
