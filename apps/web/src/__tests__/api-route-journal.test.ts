/**
 * Unit tests for POST & GET /api/accounting/journal
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

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit:   vi.fn().mockResolvedValue({ success: true }),
  getClientIp:      () => '127.0.0.1',
  rateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mockAssertPeriodOpen }));

vi.mock('@/lib/invoice-counter', () => ({
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2024-000001'),
}));

vi.mock('@/lib/feature-access', () => ({
  requireFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/journal-validation', () => ({
  validateJournalLines: vi.fn().mockImplementation(
    (lines: Array<{ debitHalalas: number; creditHalalas: number }>) => {
      const totalDebit  = lines.reduce((s, l) => s + l.debitHalalas,  0);
      const totalCredit = lines.reduce((s, l) => s + l.creditHalalas, 0);
      if (totalDebit !== totalCredit) throw new Error('القيد غير متوازن');
      return { totalDebit, totalCredit };
    },
  ),
}));

vi.mock('drizzle-orm', () => ({
  eq:      vi.fn(() => ({})),
  and:     vi.fn((...a: unknown[]) => ({ a })),
  desc:    vi.fn(),
  gte:     vi.fn(),
  lte:     vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@/lib/schema', () => ({
  journalEntries:  { agencyId: 'agencyId', id: 'id', date: 'date', createdAt: 'createdAt' },
  journalLines:    { agencyId: 'agencyId', entryId: 'entryId', sortOrder: 'sortOrder' },
  chartOfAccounts: { agencyId: 'agencyId', code: 'code' },
}));

// ─── Mock db ──────────────────────────────────────────────────────────────────

const { mockSelectResults, mockDb } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];

  const makeChain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'offset', 'orderBy']) {
      c[m] = vi.fn().mockReturnValue(c);
    }
    c['then']  = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };

  const mockInsertChain = {
    values: vi.fn().mockResolvedValue([]),
  };

  const mockTx = {
    insert: vi.fn().mockReturnValue(mockInsertChain),
  };

  const mockDb = {
    transaction: vi.fn().mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    ),
    select: vi.fn().mockImplementation(() => {
      const rows = selectResults.shift() ?? [];
      return makeChain(rows as unknown[]);
    }),
  };

  return {
    mockSelectResults: { results: selectResults, next: (r: unknown[]) => selectResults.push(r) },
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { POST, GET } from '@/app/api/accounting/journal/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_USER = { uid: 'user-1', agencyId: 'agency-1', role: 'accountant' };

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/accounting/journal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

function makeGetRequest(params = ''): Request {
  return new Request(`http://localhost/api/accounting/journal${params}`);
}

const BALANCED_LINES = [
  { accountCode: '1120', accountNameAr: 'ذمم مدينة', debitHalalas: 115_00, creditHalalas: 0 },
  { accountCode: '4000', accountNameAr: 'إيراد',     debitHalalas: 0,      creditHalalas: 115_00 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/accounting/journal', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResults.results.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockAssertPeriodOpen.mockResolvedValue(undefined);
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it('401 عند توكن غير صالح', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await POST(makePostRequest({ date: '2024-03-15', lines: BALANCED_LINES }));
    expect(res.status).toBe(401);
  });

  // ── Input validation ──────────────────────────────────────────────────────────

  it('400 عند غياب التاريخ', async () => {
    const res = await POST(makePostRequest({ lines: BALANCED_LINES }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/التاريخ/);
  });

  it('400 لتنسيق تاريخ خاطئ (DD/MM/YYYY)', async () => {
    const res = await POST(makePostRequest({ date: '15/03/2024', lines: BALANCED_LINES }));
    expect(res.status).toBe(400);
  });

  it('400 لتنسيق تاريخ خاطئ (نص عشوائي)', async () => {
    const res = await POST(makePostRequest({ date: 'not-a-date', lines: BALANCED_LINES }));
    expect(res.status).toBe(400);
  });

  it('422 للقيد غير المتوازن (DR ≠ CR)', async () => {
    const { validateJournalLines } = await import('@/lib/journal-validation');
    vi.mocked(validateJournalLines).mockImplementationOnce(() => {
      throw new Error('إجمالي المدين 115 لا يساوي الدائن 100');
    });
    const res = await POST(makePostRequest({ date: '2024-03-15', lines: BALANCED_LINES }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/يساوي|متوازن/i);
  });

  it('422 إذا كانت الحسابات غير موجودة في الدليل', async () => {
    mockSelectResults.next([{ code: '1120' }]); // only 1 of 2 codes found
    const res = await POST(makePostRequest({ date: '2024-03-15', lines: BALANCED_LINES }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/غير موجودة/);
  });

  it('422 إذا كانت الفترة مقفلة', async () => {
    mockSelectResults.next([{ code: '1120' }, { code: '4000' }]);
    mockAssertPeriodOpen.mockRejectedValue(new BusinessError('الفترة مقفلة', 422));
    const res = await POST(makePostRequest({ date: '2024-03-15', lines: BALANCED_LINES }));
    expect(res.status).toBe(422);
  });

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('200 — قيد يدوي متوازن يُحفظ بنجاح', async () => {
    mockSelectResults.next([{ code: '1120' }, { code: '4000' }]);
    const res = await POST(makePostRequest({
      date: '2024-03-15', descriptionAr: 'قيد اختبار', lines: BALANCED_LINES,
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeTruthy();
  });

  it('200 — القيد بقيمة صفر مقبول', async () => {
    const zeroLines = [
      { accountCode: '1110', accountNameAr: 'بنك', debitHalalas: 0, creditHalalas: 0 },
    ];
    const { validateJournalLines } = await import('@/lib/journal-validation');
    vi.mocked(validateJournalLines).mockReturnValueOnce({ totalDebit: 0, totalCredit: 0 });
    mockSelectResults.next([{ code: '1110' }]);
    const res = await POST(makePostRequest({ date: '2024-03-15', lines: zeroLines }));
    expect(res.status).toBe(200);
  });

  // ── Error handling ─────────────────────────────────────────────────────────────

  it('500 عند خطأ في قاعدة البيانات', async () => {
    mockSelectResults.next([{ code: '1120' }, { code: '4000' }]);
    mockDb.transaction.mockRejectedValueOnce(new Error('DB error'));
    const res = await POST(makePostRequest({ date: '2024-03-15', lines: BALANCED_LINES }));
    expect(res.status).toBe(500);
  });

});

describe('GET /api/accounting/journal', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResults.results.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
  });

  it('401 عند توكن غير صالح', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('200 — قائمة القيود (بدون سطور)', async () => {
    mockSelectResults.next([
      { id: 'je-1', agencyId: 'agency-1', entryNumber: 'JE-2024-000001', date: '2024-03-15' },
    ]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe('je-1');
  });

  it('200 — قائمة فارغة عند عدم وجود قيود', async () => {
    mockSelectResults.next([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toHaveLength(0);
  });

  it('200 — ?lines=1 يجلب السطور مع القيود', async () => {
    mockSelectResults.next([{ id: 'je-1', agencyId: 'agency-1' }]);
    mockSelectResults.next([{ id: 'jl-1', entryId: 'je-1', sortOrder: 1 }]);
    const res = await GET(makeGetRequest('?lines=1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries[0].lines).toBeDefined();
    expect(data.entries[0].lines).toHaveLength(1);
  });

  it('200 — pagination: الصفحة 2 حجم 10', async () => {
    mockSelectResults.next([]);
    const res = await GET(makeGetRequest('?page=2&limit=10'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);
  });

  it('200 — تصفية بنطاق تاريخ from/to', async () => {
    mockSelectResults.next([]);
    const res = await GET(makeGetRequest('?from=2024-01-01&to=2024-03-31'));
    expect(res.status).toBe(200);
  });

  it('200 — limit لا يتجاوز 500', async () => {
    mockSelectResults.next([]);
    const res = await GET(makeGetRequest('?limit=9999'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pageSize).toBeLessThanOrEqual(500);
  });

});
