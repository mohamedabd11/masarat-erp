/**
 * Unit tests for GET & POST /api/banking/reconcile
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data, status: init?.status ?? 200, json: async () => data,
    }),
  },
}));

// ─── Hoisted shared definitions ───────────────────────────────────────────────

const {
  ApiAuthError, BusinessError,
  mockVerifyAuth, mockAssertRole, mockAssertPeriodOpen,
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
    ApiAuthError, BusinessError,
    mockVerifyAuth:       vi.fn(),
    mockAssertRole:       vi.fn(),
    mockAssertPeriodOpen: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth, assertRole: mockAssertRole,
  ApiAuthError, BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));

vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mockAssertPeriodOpen }));

vi.mock('@/lib/invoice-counter', () => ({
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2024-000001'),
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock('drizzle-orm', () => ({
  eq:      vi.fn(() => ({})),
  and:     vi.fn((...a: unknown[]) => ({ a })),
  inArray: vi.fn(() => ({})),
  gte:     vi.fn(() => ({})),
  lte:     vi.fn(() => ({})),
}));

vi.mock('@/lib/schema', () => ({
  bankAccounts: {
    id: 'id', agencyId: 'agencyId',
    currentBalanceHalalas: 'currentBalanceHalalas',
  },
  bankTransactions: {
    id: 'id', agencyId: 'agencyId', bankAccountId: 'bankAccountId',
    isReconciled: 'isReconciled', type: 'type', amountHalalas: 'amountHalalas', date: 'date',
  },
  journalEntries: {},
  journalLines:   {},
}));

// ─── Mock db ──────────────────────────────────────────────────────────────────

const { mockTxSelect, mockDbSelect, mockDb } = vi.hoisted(() => {
  const txSelectResults: unknown[][] = [];
  const dbSelectResults: unknown[][] = [];

  const makeChain = (source: unknown[][]) => {
    const rows = source.shift() ?? [];
    const p = Promise.resolve(rows);
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'offset', 'orderBy']) {
      c[m] = vi.fn().mockReturnValue(c);
    }
    c['then']  = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };

  const mockInsertChain = { values: vi.fn().mockResolvedValue([]) };
  const mockUpdateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };

  const mockTx = {
    select: vi.fn().mockImplementation(() => makeChain(txSelectResults)),
    insert: vi.fn().mockReturnValue(mockInsertChain),
    update: vi.fn().mockReturnValue(mockUpdateChain),
  };

  const mockDb = {
    select:      vi.fn().mockImplementation(() => makeChain(dbSelectResults)),
    transaction: vi.fn().mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    ),
  };

  return {
    mockTxSelect: { results: txSelectResults, next: (r: unknown[]) => txSelectResults.push(r) },
    mockDbSelect: { results: dbSelectResults, next: (r: unknown[]) => dbSelectResults.push(r) },
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET, POST } from '@/app/api/banking/reconcile/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_USER = { uid: 'user-1', agencyId: 'agency-1', role: 'accountant' };

const BANK_ACCOUNT = {
  id: 'ba-1', agencyId: 'agency-1', nameAr: 'البنك الأهلي',
  currentBalanceHalalas: 100_000_00, reconciledAt: null, reconciledBalanceHalalas: 0,
};

const TRANSACTIONS = [
  { id: 'tx-1', isReconciled: false, type: 'deposit',    amountHalalas: 10_000_00, date: '2024-03-10' },
  { id: 'tx-2', isReconciled: false, type: 'withdrawal', amountHalalas:  2_000_00, date: '2024-03-12' },
];

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost/api/banking/reconcile${params}`);
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/banking/reconcile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const VALID_POST_BODY = {
  bankAccountId:           'ba-1',
  statementDate:           '2024-03-31',
  statementBalanceHalalas: 100_000_00,
  transactionIds:          ['tx-1', 'tx-2'],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/banking/reconcile', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelect.results.length = 0;
    mockDbSelect.results.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
  });

  it('401 عند توكن غير صالح', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await GET(makeGetRequest('?accountId=ba-1'));
    expect(res.status).toBe(401);
  });

  it('400 عند غياب accountId', async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/accountId/);
  });

  it('404 إذا لم يُعثر على الحساب', async () => {
    mockDbSelect.next([]);  // account not found
    const res = await GET(makeGetRequest('?accountId=ghost'));
    expect(res.status).toBe(404);
  });

  it('200 — يُعيد الحساب وحركاته', async () => {
    mockDbSelect.next([BANK_ACCOUNT]);
    mockDbSelect.next(TRANSACTIONS);
    const res = await GET(makeGetRequest('?accountId=ba-1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.account.id).toBe('ba-1');
    expect(data.transactions).toHaveLength(2);
  });

  it('200 — unreconciledSum صحيح (إيداع 10000 - سحب 2000 = 8000 ر.س)', async () => {
    mockDbSelect.next([BANK_ACCOUNT]);
    mockDbSelect.next(TRANSACTIONS);
    const res = await GET(makeGetRequest('?accountId=ba-1'));
    const data = await res.json();
    expect(data.unreconciledSum).toBe(8_000_00);
  });

  it('200 — قائمة فارغة عند عدم وجود حركات', async () => {
    mockDbSelect.next([BANK_ACCOUNT]);
    mockDbSelect.next([]);
    const res = await GET(makeGetRequest('?accountId=ba-1'));
    const data = await res.json();
    expect(data.transactions).toHaveLength(0);
    expect(data.unreconciledSum).toBe(0);
  });

});

describe('POST /api/banking/reconcile', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelect.results.length = 0;
    mockDbSelect.results.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockAssertPeriodOpen.mockResolvedValue(undefined);
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it('401 عند توكن غير صالح', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(401);
  });

  // ── Input validation ──────────────────────────────────────────────────────────

  it('400 عند غياب bankAccountId', async () => {
    const { bankAccountId: _, ...body } = VALID_POST_BODY;
    const res = await POST(makePostRequest(body));
    expect(res.status).toBe(400);
  });

  it('400 عند غياب statementDate', async () => {
    const { statementDate: _, ...body } = VALID_POST_BODY;
    const res = await POST(makePostRequest(body));
    expect(res.status).toBe(400);
  });

  it('400 عند قائمة transactionIds فارغة', async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, transactionIds: [] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/transactionIds/);
  });

  // ── Business rules ────────────────────────────────────────────────────────────

  it('404 إذا لم يُعثر على الحساب البنكي', async () => {
    mockTxSelect.next([]);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(404);
  });

  it('422 إذا كانت الفترة مقفلة', async () => {
    mockTxSelect.next([BANK_ACCOUNT]);
    mockAssertPeriodOpen.mockRejectedValue(new BusinessError('الفترة مقفلة', 422));
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(422);
  });

  it('400 عند وجود معرّفات حركة غير صالحة', async () => {
    mockTxSelect.next([BANK_ACCOUNT]);
    mockTxSelect.next([{ id: 'tx-1' }]);  // only 1 of 2 valid
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/غير صالحة/);
  });

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('200 — مطابقة ناجحة بدون فروقات', async () => {
    mockTxSelect.next([BANK_ACCOUNT]);
    mockTxSelect.next([{ id: 'tx-1' }, { id: 'tx-2' }]);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.reconciledCount).toBe(2);
    expect(data.discrepancyHalalas).toBe(0);
    expect(data.discrepancyEntryId).toBeUndefined();
  });

  it('200 — مطابقة مع فروقات: يُسجَّل قيد المطابقة', async () => {
    const accountWithDiff = { ...BANK_ACCOUNT, currentBalanceHalalas: 101_000_00 };
    mockTxSelect.next([accountWithDiff]);
    mockTxSelect.next([{ id: 'tx-1' }, { id: 'tx-2' }]);
    const body = { ...VALID_POST_BODY, statementBalanceHalalas: 100_000_00 };
    const res = await POST(makePostRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    // كتاب (101000) - بيان بنك (100000) = 1000 عجز
    expect(data.discrepancyHalalas).toBe(1_000_00);
    expect(data.discrepancyEntryId).toBeTruthy();
  });

  it('200 — فروق أقل من هللة واحدة: لا قيد مطابقة', async () => {
    // discrepancy = 0 halalas → no JE
    mockTxSelect.next([BANK_ACCOUNT]);
    mockTxSelect.next([{ id: 'tx-1' }, { id: 'tx-2' }]);
    const res = await POST(makePostRequest(VALID_POST_BODY));
    const data = await res.json();
    expect(data.discrepancyEntryId).toBeUndefined();
  });

  // ── Error handling ─────────────────────────────────────────────────────────────

  it('500 عند خطأ في قاعدة البيانات', async () => {
    mockDb.transaction.mockRejectedValueOnce(new Error('DB error'));
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(500);
  });

});
