export type CoaAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type CoaReportDepth = 3 | 4 | 'all';

export interface CoaHierarchyAccount {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: CoaAccountType;
  parentId: string | null;
  level: number;
  allowDirectEntry: boolean;
  isActive?: boolean;
}

export interface CoaAmountRow extends CoaHierarchyAccount {
  amount: number;
  directAmount: number;
  isSummary: boolean;
}

export interface TrialBalanceAmounts {
  openDebit: number;
  openCredit: number;
  periodDebit: number;
  periodCredit: number;
  totalDebit: number;
  totalCredit: number;
}

export interface CoaTrialBalanceRow extends CoaHierarchyAccount, TrialBalanceAmounts {
  isSummary: boolean;
}

const MAX_ACCOUNT_LEVEL = 12;

export function parseReportDepth(value: string | null | undefined): CoaReportDepth {
  if (value === '4') return 4;
  if (value === 'all') return 'all';
  return 3;
}

/**
 * Recalculate every account level from parent links and reject invalid trees.
 * This is used before saving a move so descendants are re-levelled together.
 */
export function calculateHierarchyLevels(accounts: readonly CoaHierarchyAccount[]): Map<string, number> {
  const byId = new Map(accounts.map(account => [account.id, account]));
  const levels = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (account: CoaHierarchyAccount): number => {
    const known = levels.get(account.id);
    if (known !== undefined) return known;
    if (visiting.has(account.id)) throw new Error('لا يمكن إنشاء دورة داخل شجرة الحسابات');
    visiting.add(account.id);

    let level = 1;
    if (account.parentId) {
      const parent = byId.get(account.parentId);
      if (!parent) throw new Error('الحساب الأب غير موجود');
      if (parent.type !== account.type) throw new Error('يجب أن يكون الحساب الأب من نفس النوع');
      if (parent.allowDirectEntry) throw new Error('الحساب الأب يجب أن يكون حساباً تجميعياً');
      if (account.isActive !== false && parent.isActive === false) {
        throw new Error('لا يمكن تنشيط حساب فرعي تحت حساب أب غير نشط');
      }
      level = visit(parent) + 1;
    }
    if (level > MAX_ACCOUNT_LEVEL) throw new Error(`الحد الأقصى لعمق شجرة الحسابات هو ${MAX_ACCOUNT_LEVEL} مستوى`);

    visiting.delete(account.id);
    levels.set(account.id, level);
    return level;
  };

  for (const account of accounts) visit(account);
  return levels;
}

export function descendantIds(accounts: readonly CoaHierarchyAccount[], accountId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const account of accounts) {
    if (!account.parentId) continue;
    const list = children.get(account.parentId) ?? [];
    list.push(account.id);
    children.set(account.parentId, list);
  }
  const result = new Set<string>();
  const visit = (id: string) => {
    for (const child of children.get(id) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      visit(child);
    }
  };
  visit(accountId);
  return result;
}

/** Parents precede children; siblings follow account-code order. */
export function flattenAccountTree<T extends CoaHierarchyAccount>(accounts: readonly T[]): T[] {
  const children = new Map<string | null, T[]>();
  for (const account of accounts) {
    const key = account.parentId ?? null;
    const list = children.get(key) ?? [];
    list.push(account);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.code.localeCompare(b.code));

  const result: T[] = [];
  const seen = new Set<string>();
  const visit = (account: T) => {
    if (seen.has(account.id)) return;
    seen.add(account.id);
    result.push(account);
    for (const child of children.get(account.id) ?? []) visit(child);
  };
  for (const root of children.get(null) ?? []) visit(root);
  // Keep malformed legacy orphans visible rather than silently dropping them.
  for (const account of [...accounts].sort((a, b) => a.code.localeCompare(b.code))) visit(account);
  return result;
}

export function rollupAccountAmounts(
  accounts: readonly CoaHierarchyAccount[],
  directByCode: ReadonlyMap<string, number>,
  depth: CoaReportDepth,
): CoaAmountRow[] {
  const children = childrenByParent(accounts);
  const memo = new Map<string, number>();
  const totalFor = (account: CoaHierarchyAccount, visiting = new Set<string>()): number => {
    const known = memo.get(account.id);
    if (known !== undefined) return known;
    if (visiting.has(account.id)) return directByCode.get(account.code) ?? 0;
    const next = new Set(visiting).add(account.id);
    const total = (directByCode.get(account.code) ?? 0)
      + (children.get(account.id) ?? []).reduce((sum, child) => sum + totalFor(child, next), 0);
    memo.set(account.id, total);
    return total;
  };

  const max = depth === 'all' ? Number.POSITIVE_INFINITY : depth;
  return flattenAccountTree(accounts)
    .filter(account => account.level <= max)
    .map(account => ({
      ...account,
      directAmount: directByCode.get(account.code) ?? 0,
      amount: totalFor(account),
      isSummary: (children.get(account.id)?.length ?? 0) > 0,
    }))
    .filter(row => row.amount !== 0);
}

export function rollupTrialBalance(
  accounts: readonly CoaHierarchyAccount[],
  directByCode: ReadonlyMap<string, TrialBalanceAmounts>,
  depth: CoaReportDepth,
): CoaTrialBalanceRow[] {
  const keys: (keyof TrialBalanceAmounts)[] = [
    'openDebit', 'openCredit', 'periodDebit', 'periodCredit', 'totalDebit', 'totalCredit',
  ];
  const children = childrenByParent(accounts);
  const memo = new Map<string, TrialBalanceAmounts>();
  const zero = (): TrialBalanceAmounts => ({
    openDebit: 0, openCredit: 0, periodDebit: 0, periodCredit: 0, totalDebit: 0, totalCredit: 0,
  });
  const totalFor = (account: CoaHierarchyAccount, visiting = new Set<string>()): TrialBalanceAmounts => {
    const known = memo.get(account.id);
    if (known) return known;
    const total = { ...(directByCode.get(account.code) ?? zero()) };
    if (!visiting.has(account.id)) {
      const next = new Set(visiting).add(account.id);
      for (const child of children.get(account.id) ?? []) {
        const childTotal = totalFor(child, next);
        for (const key of keys) total[key] += childTotal[key];
      }
    }
    memo.set(account.id, total);
    return total;
  };

  const max = depth === 'all' ? Number.POSITIVE_INFINITY : depth;
  return flattenAccountTree(accounts)
    .filter(account => account.level <= max)
    .map(account => ({
      ...account,
      ...totalFor(account),
      isSummary: (children.get(account.id)?.length ?? 0) > 0,
    }))
    .filter(row => row.totalDebit !== 0 || row.totalCredit !== 0);
}

function childrenByParent(accounts: readonly CoaHierarchyAccount[]): Map<string, CoaHierarchyAccount[]> {
  const children = new Map<string, CoaHierarchyAccount[]>();
  for (const account of accounts) {
    if (!account.parentId) continue;
    const list = children.get(account.parentId) ?? [];
    list.push(account);
    children.set(account.parentId, list);
  }
  return children;
}
