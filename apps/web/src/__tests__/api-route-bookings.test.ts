/**
 * Unit tests for the bookings API routes (fully mocked DB):
 *   - POST  /api/bookings/create  (src/app/api/bookings/create/route.ts)
 *   - GET   /api/bookings         (src/app/api/bookings/route.ts)
 *   - PATCH /api/bookings/[id]    (src/app/api/bookings/[id]/route.ts)
 *
 * NOTE: the create route sets status='confirmed' and returns
 * `{ bookingId, bookingNumber }` (200) — it does not return 201. Tests assert
 * the actual contract.
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

const { ApiAuthError, BusinessError, mockVerifyAuth, mockAssertRole } = vi.hoisted(() => {
  class ApiAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  class BusinessError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  return { ApiAuthError, BusinessError, mockVerifyAuth: vi.fn(), mockAssertRole: vi.fn() };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth, assertRole: mockAssertRole,
  ApiAuthError, BusinessError,
  ROLES_AGENT_UP: ['owner', 'admin', 'manager', 'accountant', 'staff', 'agent'],
}));

vi.mock('drizzle-orm', () => ({
  eq:   vi.fn(() => ({})),
  and:  vi.fn((...a: unknown[]) => ({ a })),
  desc: vi.fn(() => ({})),
}));

vi.mock('@/lib/schema', () => ({
  bookings: { id: 'id', agencyId: 'agencyId', status: 'status', serviceType: 'serviceType', customerId: 'customerId', createdAt: 'createdAt', bookingNumber: 'bookingNumber' },
  invoices: { id: 'id', agencyId: 'agencyId', bookingId: 'bookingId', invoiceNumber: 'invoiceNumber' },
}));

vi.mock('@/lib/invoice-counter', () => ({
  getNextBookingNumber: vi.fn().mockResolvedValue('BK-2024-0001'),
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { mockRateLimit } = vi.hoisted(() => ({ mockRateLimit: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockRateLimit,
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ─── Mock db ──────────────────────────────────────────────────────────────────

const { mockSelect, mockDb } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];

  const makeSelectChain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'leftJoin', 'limit', 'offset', 'orderBy']) c[m] = vi.fn().mockReturnValue(c);
    c['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };
  const makeInsertChain = () => {
    const p = Promise.resolve([]);
    const c: Record<string, unknown> = {};
    for (const m of ['values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning']) c[m] = vi.fn().mockReturnValue(c);
    c['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };
  const makeUpdateChain = () => {
    const p = Promise.resolve([]);
    const c: Record<string, unknown> = {};
    for (const m of ['set', 'where', 'returning']) c[m] = vi.fn().mockReturnValue(c);
    c['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    c['catch'] = (rej: (e: unknown) => unknown) => p.catch(rej);
    return c;
  };

  const mockTx = {
    select: vi.fn().mockImplementation(() => makeSelectChain((selectResults.shift() ?? []) as unknown[])),
    insert: vi.fn().mockImplementation(() => makeInsertChain()),
    update: vi.fn().mockImplementation(() => makeUpdateChain()),
  };

  const mockDb = {
    select: vi.fn().mockImplementation(() => makeSelectChain((selectResults.shift() ?? []) as unknown[])),
    insert: vi.fn().mockImplementation(() => makeInsertChain()),
    update: vi.fn().mockImplementation(() => makeUpdateChain()),
    transaction: vi.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  };

  return {
    mockSelect: { results: selectResults, next: (r: unknown[]) => selectResults.push(r) },
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { POST } from '@/app/api/bookings/create/route';
import { GET } from '@/app/api/bookings/route';
import { PATCH } from '@/app/api/bookings/[id]/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_USER = { uid: 'user-1', agencyId: 'agency-1', role: 'agent' };

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/bookings/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function makeGet(url = 'http://localhost/api/bookings'): Request {
  return new Request(url, { method: 'GET' });
}
function makePatch(body: unknown): Request {
  return new Request('http://localhost/api/bookings/bk-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  type: 'flight',
  customerName: { ar: 'أحمد', en: 'Ahmed' },
  customerPhone: '0500000000',
  pricing: { totalAmount: 1_000_00, totalCost: 700_00, currency: 'SAR' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bookings API routes', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.results.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
    mockRateLimit.mockResolvedValue({ success: true });
  });

  // ── POST /create ──────────────────────────────────────────────────────────────

  it('POST 200 — ينشئ حجزاً ويعيد المعرف ورقم الحجز', async () => {
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bookingId).toBeTruthy();
    expect(data.bookingNumber).toBe('BK-2024-0001');
  });

  it('POST 401 — بدون توكن', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('POST 403 — دور غير مصرح', async () => {
    mockAssertRole.mockImplementation(() => { throw new ApiAuthError('ممنوع', 403); });
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('POST 400 — نوع خدمة غير صالح', async () => {
    const res = await POST(makePost({ ...VALID_BODY, type: 'spaceship' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/نوع الخدمة/);
  });

  it('POST 400 — غياب نوع الخدمة', async () => {
    const res = await POST(makePost({ ...VALID_BODY, type: undefined }));
    expect(res.status).toBe(400);
  });

  it('POST 429 — تجاوز حد الطلبات', async () => {
    mockRateLimit.mockResolvedValue({ success: false });
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(429);
  });

  it('POST 500 — خطأ في قاعدة البيانات', async () => {
    mockDb.transaction.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(500);
  });

  // ── GET ───────────────────────────────────────────────────────────────────────

  it('GET 200 — يعيد قائمة مصفّاة حسب الوكالة مع hasInvoice', async () => {
    mockSelect.next([
      { id: 'bk-1', agencyId: 'agency-1', status: 'confirmed', invoiceId: 'inv-1' },
      { id: 'bk-2', agencyId: 'agency-1', status: 'draft', invoiceId: null },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bookings).toHaveLength(2);
    expect(data.bookings[0].hasInvoice).toBe(true);
    expect(data.bookings[1].hasInvoice).toBe(false);
    expect(data.bookings.every((b: { agencyId: string }) => b.agencyId === 'agency-1')).toBe(true);
  });

  it('GET 401 — بدون توكن', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  // ── PATCH ───────────────────────────────────────────────────────────────────────

  it('PATCH 200 — يحدّث الحالة', async () => {
    mockSelect.next([{ id: 'bk-1', status: 'confirmed' }]); // existing lookup
    const res = await PATCH(makePatch({ status: 'completed' }), { params: { id: 'bk-1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('PATCH 400 — حالة غير صالحة', async () => {
    const res = await PATCH(makePatch({ status: 'nonsense' }), { params: { id: 'bk-1' } });
    expect(res.status).toBe(400);
  });

  it('PATCH 404 — حجز غير موجود', async () => {
    mockSelect.next([]); // existing lookup returns nothing
    const res = await PATCH(makePatch({ status: 'completed' }), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('PATCH 422 — إعادة تفعيل حجز ملغي', async () => {
    mockSelect.next([{ id: 'bk-1', status: 'cancelled' }]);
    const res = await PATCH(makePatch({ status: 'confirmed' }), { params: { id: 'bk-1' } });
    expect(res.status).toBe(422);
  });

  it('PATCH 403 — دور غير مصرح', async () => {
    mockAssertRole.mockImplementation(() => { throw new ApiAuthError('ممنوع', 403); });
    const res = await PATCH(makePatch({ status: 'completed' }), { params: { id: 'bk-1' } });
    expect(res.status).toBe(403);
  });

});
