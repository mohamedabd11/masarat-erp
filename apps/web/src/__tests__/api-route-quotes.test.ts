/**
 * Unit tests for the quotes API routes (fully mocked DB):
 *   - POST  /api/quotes        (src/app/api/quotes/route.ts)
 *   - GET   /api/quotes
 *   - PATCH /api/quotes/[id]    (src/app/api/quotes/[id]/route.ts)
 *
 * NOTE: POST returns 200 with `{ success: true, id }` (not 201) — the route
 * does not set a 201 status. Tests assert the actual contract.
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
  quotes: { id: 'id', agencyId: 'agencyId', status: 'status', createdAt: 'createdAt', quoteNumber: 'quoteNumber' },
}));

// ─── Mock db ──────────────────────────────────────────────────────────────────

const { mockSelect, mockDb } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];

  const makeSelectChain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'offset', 'orderBy']) c[m] = vi.fn().mockReturnValue(c);
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

  const mockDb = {
    select: vi.fn().mockImplementation(() => makeSelectChain((selectResults.shift() ?? []) as unknown[])),
    insert: vi.fn().mockImplementation(() => makeInsertChain()),
    update: vi.fn().mockImplementation(() => makeUpdateChain()),
  };

  return {
    mockSelect: { results: selectResults, next: (r: unknown[]) => selectResults.push(r) },
    mockDb,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET, POST } from '@/app/api/quotes/route';
import { PATCH } from '@/app/api/quotes/[id]/route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_USER = { uid: 'user-1', agencyId: 'agency-1', role: 'agent' };

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/quotes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
function makeGet(): Request {
  return new Request('http://localhost/api/quotes', { method: 'GET' });
}
function makePatch(body: unknown): Request {
  return new Request('http://localhost/api/quotes/q-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  quoteNumber: 'Q-2024-0001',
  customerName: 'أحمد',
  items: [{ description: 'تذكرة', quantity: 1, unitPriceHalalas: 1_000_00, vatHalalas: 150_00 }],
  totalHalalas: 1_150_00,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('quotes API routes', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.results.length = 0;
    mockVerifyAuth.mockResolvedValue(DEFAULT_USER);
    mockAssertRole.mockReturnValue(undefined);
  });

  // ── POST ──────────────────────────────────────────────────────────────────────

  it('POST 200 — ينشئ عرض سعر ويعيد المعرف', async () => {
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeTruthy();
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

  it('POST 400 — غياب quoteNumber', async () => {
    const res = await POST(makePost({ ...VALID_BODY, quoteNumber: undefined }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/quoteNumber/);
  });

  it('POST 400 — إجمالي غير صالح (سالب)', async () => {
    const res = await POST(makePost({ ...VALID_BODY, totalHalalas: -5 }));
    expect(res.status).toBe(400);
  });

  it('POST 500 — خطأ في قاعدة البيانات', async () => {
    mockDb.insert.mockImplementationOnce(() => { throw new Error('db down'); });
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(500);
  });

  // ── GET ───────────────────────────────────────────────────────────────────────

  it('GET 200 — يعيد القائمة المصفّاة حسب الوكالة', async () => {
    mockSelect.next([
      { id: 'q-1', agencyId: 'agency-1', status: 'draft' },
      { id: 'q-2', agencyId: 'agency-1', status: 'sent' },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.quotes).toHaveLength(2);
    expect(data.quotes.every((q: { agencyId: string }) => q.agencyId === 'agency-1')).toBe(true);
  });

  it('GET 401 — بدون توكن', async () => {
    mockVerifyAuth.mockRejectedValue(new ApiAuthError('غير مصرح', 401));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  // ── PATCH ───────────────────────────────────────────────────────────────────────

  it('PATCH 200 — يحدّث الحالة', async () => {
    mockSelect.next([{ id: 'q-1', status: 'draft' }]);
    const res = await PATCH(makePatch({ status: 'sent' }), { params: { id: 'q-1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('PATCH 404 — عرض سعر غير موجود', async () => {
    mockSelect.next([]); // existing lookup returns nothing
    const res = await PATCH(makePatch({ status: 'sent' }), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('PATCH 422 — تحويل عرض سعر محوّل مسبقاً', async () => {
    mockSelect.next([{ id: 'q-1', status: 'converted' }]);
    const res = await PATCH(makePatch({ status: 'converted' }), { params: { id: 'q-1' } });
    expect(res.status).toBe(422);
  });

  it('PATCH 403 — دور غير مصرح', async () => {
    mockAssertRole.mockImplementation(() => { throw new ApiAuthError('ممنوع', 403); });
    const res = await PATCH(makePatch({ status: 'sent' }), { params: { id: 'q-1' } });
    expect(res.status).toBe(403);
  });

});
