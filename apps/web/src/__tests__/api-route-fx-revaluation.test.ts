import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}));

const {
  ApiAuthError, BusinessError, mockVerifyAuth, mockAssertRole,
  mockAssertPeriodOpen, selectResults, mockTransaction, mockDb,
} = vi.hoisted(() => {
  class ApiAuthError extends Error { constructor(message: string, readonly status: number) { super(message); } }
  class BusinessError extends Error { constructor(message: string, readonly status: number) { super(message); } }
  const selectResults: unknown[][] = [];
  const makeChain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy', 'limit']) chain[method] = vi.fn().mockReturnValue(chain);
    chain['then'] = promise.then.bind(promise);
    chain['catch'] = promise.catch.bind(promise);
    return chain;
  };
  const mockTransaction = vi.fn();
  return {
    ApiAuthError, BusinessError,
    mockVerifyAuth: vi.fn(), mockAssertRole: vi.fn(), mockAssertPeriodOpen: vi.fn(),
    selectResults, mockTransaction,
    mockDb: {
      select: vi.fn(() => makeChain(selectResults.shift() ?? [])),
      transaction: mockTransaction,
    },
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth, assertRole: mockAssertRole, ApiAuthError, BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mockAssertPeriodOpen }));
vi.mock('@/lib/invoice-counter', () => ({ getNextJournalNumber: vi.fn().mockResolvedValue('JE-1') }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/schema', () => ({
  bankAccounts: { id: 'id', agencyId: 'agency_id', currency: 'currency', isActive: 'active', currentBalanceHalalas: 'balance' },
  exchangeRates: { agencyId: 'agency_id', fromCurrency: 'from', toCurrency: 'to', effectiveDate: 'date' },
  journalEntries: { id: 'id', agencyId: 'agency_id', source: 'source', date: 'date' },
  journalLines: {},
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), ne: vi.fn(),
  sql: vi.fn((parts: TemplateStringsArray) => parts.join('')),
}));

import { POST } from '@/app/api/accounting/fx-revaluation/route';

const request = (body: unknown) => new Request('http://localhost/api/accounting/fx-revaluation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/accounting/fx-revaluation — safe accounting periods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    mockVerifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'accountant' });
    mockAssertRole.mockReturnValue(undefined);
    mockAssertPeriodOpen.mockResolvedValue(undefined);
  });

  it.each(['2026-02-30', '14/09/2026', 'not-a-date'])(
    'rejects invalid date %s before querying or writing', async (revaluationDate) => {
      const response = await POST(request({ revaluationDate }));
      expect(response.status).toBe(400);
      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    },
  );

  it('returns the accounting-period business error instead of a generic 500', async () => {
    selectResults.push(
      [{ id: 'bank-1', nameAr: 'بنك دولار', type: 'bank', currency: 'USD', fxBalanceMinor: 10_000, currentBalanceHalalas: 35_000 }],
      [{ rate: 37_500 }],
    );
    mockAssertPeriodOpen.mockRejectedValue(new BusinessError('الفترة المحاسبية مغلقة', 422));
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));

    const response = await POST(request({ revaluationDate: '2026-09-14' }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'الفترة المحاسبية مغلقة' });
  });
});
