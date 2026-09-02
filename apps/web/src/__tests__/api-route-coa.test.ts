/**
 * Regression tests for chart-of-accounts create, edit, and delete routes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

const {
  ApiAuthError,
  BusinessError,
  mockVerifyAuth,
  mockAssertRole,
} = vi.hoisted(() => {
  class ApiAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  class BusinessError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return {
    ApiAuthError,
    BusinessError,
    mockVerifyAuth: vi.fn(),
    mockAssertRole: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth,
  assertRole: mockAssertRole,
  ApiAuthError,
  BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));

vi.mock('@/lib/feature-access', () => ({
  requireFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  asc: vi.fn(),
  sum: vi.fn(),
}));

vi.mock('@/lib/schema', () => ({
  chartOfAccounts: {
    id: 'id', agencyId: 'agencyId', code: 'code', type: 'type', parentId: 'parentId',
    level: 'level', isActive: 'isActive', allowDirectEntry: 'allowDirectEntry',
  },
  journalLines: { id: 'id', agencyId: 'agencyId', accountCode: 'accountCode' },
}));

const {
  selectResults,
  insertedValues,
  updatedValues,
  mockDeleteWhere,
  mockDb,
} = vi.hoisted(() => {
  const results: unknown[][] = [];
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  const makeSelectChain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit', 'orderBy', 'groupBy']) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => promise.then(resolve, reject);
    chain.catch = (reject: (error: unknown) => unknown) => promise.catch(reject);
    return chain;
  };

  const makeUpdateChain = () => ({
    set: vi.fn().mockImplementation((value: unknown) => {
      updated.push(value);
      return { where: vi.fn().mockResolvedValue([]) };
    }),
  });
  const mockDeleteWhere = vi.fn().mockResolvedValue([]);
  const transactionDb = {
    update: vi.fn().mockImplementation(makeUpdateChain),
  };
  const mockDb = {
    select: vi.fn().mockImplementation(() => makeSelectChain(results.shift() ?? [])),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((value: unknown) => {
        inserted.push(value);
        return Promise.resolve([]);
      }),
    }),
    update: vi.fn().mockImplementation(makeUpdateChain),
    delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
    transaction: vi.fn().mockImplementation((run: (tx: typeof transactionDb) => Promise<unknown>) => run(transactionDb)),
  };

  return {
    selectResults: results,
    insertedValues: inserted,
    updatedValues: updated,
    mockDeleteWhere,
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { POST } from '@/app/api/accounting/coa/route';
import { PATCH, DELETE } from '@/app/api/accounting/coa/[id]/route';

const DEFAULT_USER = { uid: 'user-1', agencyId: 'agency-1', role: 'accountant' };

type AccountFixture = {
  id: string;
  agencyId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subType: string | null;
  parentId: string | null;
  level: number;
  allowDirectEntry: boolean;
  openingBalanceHalalas: number;
  isActive: boolean;
  isSystem: boolean;
};

function account(overrides: Partial<AccountFixture> = {}): AccountFixture {
  return {
    id: 'account-1', agencyId: 'agency-1', code: '1100', nameAr: 'حساب اختبار', nameEn: 'Test account',
    type: 'asset', subType: 'current_asset', parentId: null, level: 1,
    allowDirectEntry: true, openingBalanceHalalas: 0, isActive: true, isSystem: false,
    ...overrides,
  };
}

function request(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Request {
  return new Request('http://localhost/api/accounting/coa/account-1', {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('chart-of-accounts mutation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    insertedValues.length = 0;
    updatedValues.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
  });

  it('ينشئ حساباً تجميعياً جديداً', async () => {
    selectResults.push([]);
    const response = await POST(request('POST', {
      code: '1000', nameAr: 'الأصول المتداولة', type: 'asset',
      subType: 'current_asset', allowDirectEntry: false,
    }));

    expect(response.status).toBe(200);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ code: '1000', level: 1, allowDirectEntry: false });
  });

  it('يرفض رصيداً افتتاحياً مباشراً لحساب تجميعي', async () => {
    const response = await POST(request('POST', {
      code: '1000', nameAr: 'الأصول', type: 'asset',
      allowDirectEntry: false, openingBalanceHalalas: 100,
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/التجميعي/);
    expect(insertedValues).toHaveLength(0);
  });

  it('يحفظ اسم الحساب وموقعه في الشجرة', async () => {
    const parent = account({ id: 'parent', code: '1000', nameAr: 'الأصول', allowDirectEntry: false });
    const child = account();
    selectResults.push([parent, child], []);

    const response = await PATCH(request('PATCH', { nameAr: 'النقدية', parentId: parent.id }), { params: { id: child.id } });

    expect(response.status).toBe(200);
    expect(updatedValues[0]).toMatchObject({ nameAr: 'النقدية', parentId: 'parent', level: 2 });
  });

  it('يمنع نقل الحساب داخل أحد فروعه', async () => {
    const parent = account({ id: 'parent', code: '1000', allowDirectEntry: false });
    const child = account({ id: 'child', code: '1100', parentId: 'parent', level: 2, allowDirectEntry: false });
    selectResults.push([parent, child], []);

    const response = await PATCH(request('PATCH', { parentId: 'child' }), { params: { id: 'parent' } });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/فروعه/);
  });

  it('يمنع تغيير نوع حساب مستخدم في قيد', async () => {
    const used = account();
    selectResults.push([used], [{ id: 'line-1' }]);

    const response = await PATCH(request('PATCH', { type: 'liability' }), { params: { id: used.id } });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/النوع الأساسي/);
  });

  it('يسمح بتعطيل حساب مخصص مستخدم مع الاحتفاظ بتاريخه', async () => {
    const used = account();
    selectResults.push([used], [{ id: 'line-1' }]);

    const response = await PATCH(request('PATCH', { isActive: false }), { params: { id: used.id } });

    expect(response.status).toBe(200);
    expect(updatedValues[0]).toMatchObject({ isActive: false });
  });

  it('يمنع تعطيل حساب النظام', async () => {
    const system = account({ isSystem: true });
    selectResults.push([system], []);

    const response = await PATCH(request('PATCH', { isActive: false }), { params: { id: system.id } });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/نظامي/);
  });

  it('يحذف حساباً مخصصاً غير مستخدم', async () => {
    const unused = account();
    selectResults.push([unused], []);

    const response = await DELETE(request('DELETE'), { params: { id: unused.id } });

    expect(response.status).toBe(200);
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
  });

  it('يمنع حذف حساب النظام أو حساب له قيود', async () => {
    const system = account({ isSystem: true });
    selectResults.push([system]);
    const systemResponse = await DELETE(request('DELETE'), { params: { id: system.id } });
    expect(systemResponse.status).toBe(409);

    const used = account({ id: 'used' });
    selectResults.push([used], [{ id: 'line-1' }]);
    const usedResponse = await DELETE(request('DELETE'), { params: { id: used.id } });
    expect(usedResponse.status).toBe(409);
  });
});
