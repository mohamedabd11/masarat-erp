/**
 * Unit tests for POST /api/payments/record
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
  mockVerifyAuth, mockAssertRole,
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
    mockVerifyAuth: vi.fn(),
    mockAssertRole: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth, assertRole: mockAssertRole,
  ApiAuthError, BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency:        (_k: string, _a: string, _o: string, fn: () => Promise<unknown>) => fn(),
  buildIdempotencyInsert: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/invoice-counter', () => ({
  getNextReceiptNumber: vi.fn().mockResolvedValue('RCT-2024-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2024-000001'),
}));

// Period-lock is a separate concern (covered by period-lock.test.ts). Mock it to
// a no-op so it does not consume a queued tx.select() row — otherwise the period
// check would swallow the invoice row and every transactional test would 404.
vi.mock('@/lib/period-lock', () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => ({ a })),
  sql: Object.assign(vi.fn((s: TemplateStringsArray) => s.join('')), { raw: vi.fn() }),
}));

vi.mock('@/lib/schema', () => ({
  invoices:        { id: 'id', agencyId: 'agencyId', paidHalalas: 'paidHalalas', totalHalalas: 'totalHalalas' },
  bookings:        { id: 'id', paidHalalas: 'paidHalalas' },
  payments:        {},
  journalEntries:  {},
  journalLines:    {},
  idempotencyKeys: {},
}));

// ─── Mock db ──────────────────────────────────────────────────────────────────
// All chains are "thenable" — every method returns `this`, and `await chain`
// resolves to the configured value so the route can destructure results.

const { mockTxSelect, mockTxUpdateResult, mockDb } = vi.hoisted(() => {
  const selectResults:  unknown[][] = [];

  // SELECT chain — resolves to queued rows
  const makeSelectChain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'offset', 'orderBy']) c[m] = vi.fn().mockReturnValue(c);
    c['then']  = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };

  // INSERT chain — resolves to [] (no returning needed for this route's inserts)
  const makeInsertChain = () => {
    const p = Promise.resolve([]);
    const c: Record<string, unknown> = {};
    for (const m of ['values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning'])
      c[m] = vi.fn().mockReturnValue(c);
    c['then']  = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };

  // UPDATE chain — resolves to configurable result (needed for .set().where().returning())
  const updateResult = { value: [{ paidHalalas: 115_00, totalHalalas: 115_00 }] };
  const makeUpdateChain = () => {
    const p = new Promise<unknown[]>((res) => res(updateResult.value));
    const c: Record<string, unknown> = {};
    for (const m of ['set', 'where', 'returning']) c[m] = vi.fn().mockReturnValue(c);
    c['then']  = p.then.bind(p);
    c['catch'] = p.catch.bind(p);
    return c;
  };

  const mockTx = {
    select: vi.fn().mockImplementation(() => {
      const rows = selectResults.shift() ?? [];
      return makeSelectChain(rows as unknown[]);
    }),
    insert: vi.fn().mockImplementation(() => makeInsertChain()),
    update: vi.fn().mockImplementation(() => makeUpdateChain()),
  };

  const mockDb = {
    transaction: vi.fn().mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    ),
  };

  return {
    mockTxSelect:       { results: selectResults, next: (r: unknown[]) => selectResults.push(r) },
    mockTxUpdateResult: updateResult,
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { POST } from '@/app/api/payments/record/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_USER = { uid: 'user-1', agencyId: 'agency-1', role: 'accountant' };

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/payments/record', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const INVOICE = {
  id: 'inv-1', agencyId: 'agency-1', invoiceNumber: 'INV-2024-000001',
  bookingId: 'booking-1', customerId: null, buyerNameAr: 'أحمد',
  totalHalalas: 115_00, paidHalalas: 0, status: 'issued',
};

const VALID_BODY = { invoiceId: 'inv-1', amountHalalas: 115_00, paymentMethod: 'cash' as const };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/payments/record', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelect.results.length = 0;
    mockTxUpdateResult.value = [{ paidHalalas: 115_00, totalHalalas: 115_00 }];
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────

  it('401 عند توكن غير صالح', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('403 لدور staff', async () => {
    mockVerifyAuth.mockResolvedValue({ ...DEFAULT_USER, role: 'staff' });
    mockAssertRole.mockImplementation(() => { throw new ApiAuthError('ممنوع', 403); });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  // ── Input validation ──────────────────────────────────────────────────────────

  it('400 عند غياب invoiceId', async () => {
    const res = await POST(makeRequest({ amountHalalas: 100, paymentMethod: 'cash' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invoiceId/);
  });

  it('400 للمبلغ صفر', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, amountHalalas: 0 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/مبلغ/);
  });

  it('400 للمبلغ السالب', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, amountHalalas: -500 }));
    expect(res.status).toBe(400);
  });

  it('400 للمبلغ الكسري (غير صحيح)', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, amountHalalas: 99.5 }));
    expect(res.status).toBe(400);
  });

  // ── Business rules ────────────────────────────────────────────────────────────

  it('404 إذا لم توجد الفاتورة', async () => {
    mockTxSelect.next([]);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('400 إذا تجاوز المبلغ المستحق', async () => {
    mockTxSelect.next([{ ...INVOICE, totalHalalas: 100_00, paidHalalas: 50_00 }]);
    const res = await POST(makeRequest({ ...VALID_BODY, amountHalalas: 60_00 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/يتجاوز/);
  });

  it('400 إذا كانت الفاتورة لحجز مختلف', async () => {
    mockTxSelect.next([{ ...INVOICE, bookingId: 'OTHER-booking' }]);
    const res = await POST(makeRequest({ ...VALID_BODY, bookingId: 'booking-1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/لا تنتمي/);
  });

  // ── Payment methods ───────────────────────────────────────────────────────────

  it.each(['cash', 'bank_transfer', 'card', 'online'])(
    '200 لطريقة الدفع %s', async (method) => {
      mockTxSelect.next([INVOICE]);
      const res = await POST(makeRequest({ ...VALID_BODY, paymentMethod: method }));
      expect(res.status).toBe(200);
    },
  );

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('200 — تسجيل دفعة كاملة مع receiptNumber', async () => {
    mockTxSelect.next([INVOICE]);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.receiptNumber).toBe('RCT-2024-000001');
    expect(data.paymentId).toBeTruthy();
  });

  it('200 — دفعة كاملة: invoiceStatus = fully_paid', async () => {
    mockTxSelect.next([INVOICE]);
    mockTxUpdateResult.value = [{ paidHalalas: 115_00, totalHalalas: 115_00 }];
    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(data.invoiceStatus).toBe('fully_paid');
    expect(data.remainingDueHalalas).toBe(0);
  });

  it('200 — دفعة جزئية: invoiceStatus = partial', async () => {
    mockTxSelect.next([INVOICE]);
    mockTxUpdateResult.value = [{ paidHalalas: 50_00, totalHalalas: 115_00 }];
    const res = await POST(makeRequest({ ...VALID_BODY, amountHalalas: 50_00 }));
    const data = await res.json();
    expect(data.invoiceStatus).toBe('partial');
    expect(data.remainingDueHalalas).toBe(65_00);
  });

  // ── Error handling ─────────────────────────────────────────────────────────────

  it('500 عند خطأ في قاعدة البيانات', async () => {
    mockDb.transaction.mockRejectedValueOnce(new Error('network error'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

});
