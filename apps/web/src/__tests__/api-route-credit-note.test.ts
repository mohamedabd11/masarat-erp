/**
 * Unit tests for POST /api/invoices/credit-note — balance-guard regression (C7).
 *
 * Verifies the credit note never posts an unbalanced journal entry:
 *   - a client-supplied totalHalalas that ≠ subtotal + vat must be rejected (422)
 *   - a balanced credit note (explicit or defaulted total) must succeed (200)
 *
 * Every external dependency is mocked so the handler runs in pure JS — no DB,
 * no Firebase, no Next.js runtime. The real gl-accounts module (pure constants)
 * is used as-is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── next/server mock ──────────────────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ─── Hoisted shared definitions ──────────────────────────────────────────────────

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
    constructor(message: string, status = 400) { super(message); this.status = status; }
  }
  return {
    ApiAuthError, BusinessError,
    mockVerifyAuth:       vi.fn(),
    mockAssertRole:       vi.fn(),
    mockAssertPeriodOpen: vi.fn(),
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  verifyAuth:       mockVerifyAuth,
  assertRole:       mockAssertRole,
  ApiAuthError,
  BusinessError,
  ROLES_MANAGER_UP: ['owner', 'admin', 'manager'],
}));

vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mockAssertPeriodOpen }));

vi.mock('@/lib/invoice-counter', () => ({
  getNextInvoiceNumber: vi.fn().mockResolvedValue('CN-2024-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2024-000001'),
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

// Idempotency wrapper runs the operation directly in tests (no DB claim).
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (_k: string, _a: string, _o: string, fn: () => Promise<unknown>) => fn(),
  buildIdempotencyInsert: () => ({}),
}));

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => ({ a })),
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: (s: string) => s }),
}));

vi.mock('@/lib/schema', () => ({
  invoices:        {},
  journalEntries:  {},
  journalLines:    {},
  idempotencyKeys: {},
}));

const { mockTx, mockDb } = vi.hoisted(() => {
  const insertChain = {
    values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined), then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r) }),
  };
  const makeSelectChain = () => {
    const p = Promise.resolve([] as unknown[]);
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where']) chain[m] = vi.fn().mockReturnValue(chain);
    chain['then']    = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    chain['catch']   = (rej: (e: unknown) => unknown) => p.catch(rej);
    chain['finally'] = (fin: () => void) => p.finally(fin);
    return chain;
  };
  const tx = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => insertChain),
  };
  return {
    mockTx: tx,
    mockDb: {
      select:      vi.fn(() => makeSelectChain()),
      transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ─── Import route under test ──────────────────────────────────────────────────────

import { POST } from '@/app/api/invoices/credit-note/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/invoices/credit-note', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const USER = { uid: 'u1', agencyId: 'a1', role: 'manager' };

describe('POST /api/invoices/credit-note — balance guard (C7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(USER);
    mockAssertRole.mockReturnValue(undefined);
    mockAssertPeriodOpen.mockResolvedValue(undefined);
  });

  it('422 — يرفض إشعاراً دائناً غير متوازن (الإجمالي ≠ المبلغ + الضريبة)', async () => {
    const res = await POST(makeRequest({
      subtotalHalalas: 1000, vatHalalas: 150, totalHalalas: 9999, reason: 'مبلغ خاطئ',
    }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/غير متوازن/);
  });

  it('200 — يقبل إشعاراً دائناً متوازناً (إجمالي صريح)', async () => {
    const res = await POST(makeRequest({
      subtotalHalalas: 1000, vatHalalas: 150, totalHalalas: 1150, reason: 'استرجاع جزئي',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.invoiceNumber).toBe('CN-2024-000001');
  });

  it('200 — يقبل إشعاراً دائناً عند حذف الإجمالي (يُحسب = المبلغ + الضريبة)', async () => {
    const res = await POST(makeRequest({
      subtotalHalalas: 2000, vatHalalas: 300, reason: 'استرجاع كامل',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('400 — يرفض مبلغاً غير صالح قبل بناء القيد', async () => {
    const res = await POST(makeRequest({ subtotalHalalas: 0, reason: 'خطأ' }));
    expect(res.status).toBe(400);
  });
});
