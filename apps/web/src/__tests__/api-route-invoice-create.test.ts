/**
 * Unit tests for POST /api/invoices/create
 *
 * Strategy: mock every external dependency so the route handler runs in pure
 * JS — no database, no Firebase, no Next.js runtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── next/server mock ────────────────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ─── Hoisted shared definitions ───────────────────────────────────────────────

const {
  ApiAuthError, BusinessError,
  mockVerifyAuth, mockAssertRole,
  mockCheckRateLimit, mockAssertPeriodOpen,
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
    mockVerifyAuth:       vi.fn(),
    mockAssertRole:       vi.fn(),
    mockCheckRateLimit:   vi.fn(),
    mockAssertPeriodOpen: vi.fn(),
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  verifyAuth:          mockVerifyAuth,
  assertRole:          mockAssertRole,
  ApiAuthError,
  BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit:   mockCheckRateLimit,
  getClientIp:      () => '127.0.0.1',
  rateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mockAssertPeriodOpen }));

vi.mock('@/lib/invoice-counter', () => ({
  getNextInvoiceNumber: vi.fn().mockResolvedValue('INV-2024-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2024-000001'),
}));

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency:        (_k: string, _a: string, _o: string, fn: () => Promise<unknown>) => fn(),
  buildIdempotencyInsert: vi.fn().mockReturnValue({}),
}));

vi.mock('drizzle-orm', () => ({
  eq:      vi.fn(() => ({})),
  and:     vi.fn((...a: unknown[]) => ({ a })),
  ne:      vi.fn(() => ({})),
  sql:     Object.assign(vi.fn(), { raw: vi.fn() }),
  inArray: vi.fn(),
  asc:     vi.fn(() => ({})),
}));

vi.mock('@/lib/schema', () => ({
  bookings:        { id: 'id', agencyId: 'agencyId', status: 'status' },
  agencies:        { id: 'id' },
  invoices:        { id: 'id', agencyId: 'agencyId', bookingId: 'bookingId',
                     status: 'status', paidHalalas: 'paidHalalas', totalHalalas: 'totalHalalas' },
  bookingLines:    { id: 'id', agencyId: 'agencyId', bookingId: 'bookingId',
                     sortOrder: 'sortOrder', createdAt: 'createdAt', status: 'status',
                     isLegacy: 'isLegacy', totalPriceExclVatHalalas: 'totalPriceExclVatHalalas',
                     vatHalalas: 'vatHalalas' },
  journalEntries:  {},
  journalLines:    {},
  customers:       { id: 'id', agencyId: 'agencyId', creditLimitHalalas: 'creditLimitHalalas' },
  idempotencyKeys: {},
}));

// ─── Mock db with configurable tx ─────────────────────────────────────────────

const { mockTxSelect, mockDb } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];

  // Returns a "thenable chain" — every method returns `this`, and `await chain`
  // resolves to `rows` because the object has a `.then()` method (making it a
  // Promise-like / "thenable"). This covers both:
  //   await tx.select().from(T).where(...)         ← no explicit .limit()
  //   await tx.select().from(T).where(...).limit(1) ← with .limit()
  const makeSelectChain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'offset', 'orderBy']) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain['then']    = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    chain['catch']   = (rej: (e: unknown) => unknown) => p.catch(rej);
    chain['finally'] = (fin: () => void) => p.finally(fin);
    return chain;
  };

  const mockInsertChain = {
    values:              vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate:  vi.fn().mockReturnThis(),
    returning:           vi.fn().mockResolvedValue([]),
  };

  const mockUpdateChain = {
    set:   vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };

  const mockTx = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectResults.shift() ?? [];
      return makeSelectChain(rows as unknown[]);
    }),
    insert: vi.fn().mockReturnValue(mockInsertChain),
    update: vi.fn().mockReturnValue(mockUpdateChain),
  };

  const mockDb = {
    transaction: vi.fn().mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    ),
  };

  return {
    mockTxSelect: { results: selectResults, next: (r: unknown[]) => selectResults.push(r) },
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ─── Import route under test ──────────────────────────────────────────────────

import { POST } from '@/app/api/invoices/create/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_AGENCY = 'agency-1';
const DEFAULT_USER   = { uid: 'user-1', agencyId: DEFAULT_AGENCY, role: 'accountant' };

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/invoices/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const BOOKING = {
  id: 'booking-1', agencyId: DEFAULT_AGENCY, status: 'confirmed',
  totalPriceHalalas: 115_00, costPriceHalalas: 80_00, serviceType: 'flight',
  customerId: null, customerNameAr: 'أحمد', customerNameEn: 'Ahmed',
  customerPhone: '05xxxxxxxx', details: {},
};

const AGENCY = {
  id: DEFAULT_AGENCY, nameAr: 'وكالة الاختبار', nameEn: 'Test Agency',
  isVatRegistered: true, vatRate: 15, vatNumber: '310000000000003', crNumber: '1010000001',
};

function setupHappyPath() {
  mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
  mockAssertRole.mockReturnValue(undefined);
  mockCheckRateLimit.mockResolvedValue({ success: true });
  mockAssertPeriodOpen.mockResolvedValue(undefined);
  mockTxSelect.next([BOOKING]);
  mockTxSelect.next([AGENCY]);
  mockTxSelect.next([]);  // no existing invoice
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/invoices/create', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelect.results.length = 0;
  });

  // ── Auth ──────────────────────────────────────────────────────────────────────

  it('401 عند عدم وجود توكن صالح', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it('403 إذا كان الدور غير كافٍ (staff)', async () => {
    mockVerifyAuth.mockResolvedValue({ ...DEFAULT_USER, role: 'staff' });
    mockAssertRole.mockImplementation(() => { throw new ApiAuthError('صلاحيات غير كافية', 403); });
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(403);
  });

  // ── Input validation ──────────────────────────────────────────────────────────

  it('400 إذا لم يُرسَل bookingId', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/bookingId/);
  });

  it('429 عند تجاوز حد الطلبات', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: false });
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(429);
  });

  // ── Business rules ────────────────────────────────────────────────────────────

  it('404 إذا لم يُعثر على الحجز', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockTxSelect.next([]);  // no booking
    const res = await POST(makeRequest({ bookingId: 'ghost' }));
    expect(res.status).toBe(404);
  });

  it('400 إذا كان الحجز بحالة pending', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockTxSelect.next([{ ...BOOKING, status: 'pending' }]);
    mockTxSelect.next([AGENCY]);
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/pending/);
  });

  it('400 إذا كان الحجز بحالة cancelled', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockTxSelect.next([{ ...BOOKING, status: 'cancelled' }]);
    mockTxSelect.next([AGENCY]);
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(400);
  });

  it('409 إذا كان للحجز فاتورة موجودة', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockTxSelect.next([BOOKING]);
    mockTxSelect.next([AGENCY]);
    mockTxSelect.next([]);                            // booking_lines (no active lines)
    mockTxSelect.next([{ id: 'existing-invoice' }]); // existing invoice → 409
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(409);
  });

  it('422 إذا كانت الفترة المحاسبية مقفلة', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockTxSelect.next([BOOKING]);
    mockTxSelect.next([AGENCY]);
    mockTxSelect.next([]);
    mockAssertPeriodOpen.mockRejectedValue(new BusinessError('الفترة مقفلة', 422));
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(422);
  });

  it('400 إذا كان المبلغ الإجمالي صفراً', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockAssertPeriodOpen.mockResolvedValue(undefined);
    mockTxSelect.next([{ ...BOOKING, totalPriceHalalas: 0 }]);
    mockTxSelect.next([AGENCY]);
    mockTxSelect.next([]);
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/صفر/);
  });

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('200 — فاتورة ناجحة مع invoiceId و invoiceNumber', async () => {
    setupHappyPath();
    const res = await POST(makeRequest({ bookingId: 'booking-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.invoiceId).toBeTruthy();
    expect(data.invoiceNumber).toBe('INV-2024-000001');
  });

  it('200 — وكالة غير مسجلة بالضريبة', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockAssertPeriodOpen.mockResolvedValue(undefined);
    mockTxSelect.next([BOOKING]);
    mockTxSelect.next([{ ...AGENCY, isVatRegistered: false }]);
    mockTxSelect.next([]);
    const res = await POST(makeRequest({ bookingId: 'booking-1' }));
    expect(res.status).toBe(200);
  });

  it('200 — حجز مكتمل (completed) يقبل الفوترة', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockAssertPeriodOpen.mockResolvedValue(undefined);
    mockTxSelect.next([{ ...BOOKING, status: 'completed' }]);
    mockTxSelect.next([AGENCY]);
    mockTxSelect.next([]);
    const res = await POST(makeRequest({ bookingId: 'booking-1' }));
    expect(res.status).toBe(200);
  });

  // ── Error handling ─────────────────────────────────────────────────────────────

  it('500 عند خطأ غير متوقع في قاعدة البيانات', async () => {
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockDb.transaction.mockRejectedValueOnce(new Error('DB connection lost'));
    const res = await POST(makeRequest({ bookingId: 'b1' }));
    expect(res.status).toBe(500);
  });

});
