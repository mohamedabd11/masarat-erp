import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }),
  },
}));

const state = vi.hoisted(() => {
  class ApiAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  class BusinessError extends Error {
    status: number;
    constructor(message: string, status = 400) { super(message); this.status = status; }
  }
  return {
    ApiAuthError,
    BusinessError,
    verifyAuth: vi.fn(),
    assertRole: vi.fn(),
    selectResults: [] as unknown[][],
    updateResult: { value: [] as unknown[] },
    inserts: [] as Array<{ table: unknown; values?: unknown }>,
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: state.verifyAuth,
  assertRole: state.assertRole,
  ApiAuthError: state.ApiAuthError,
  BusinessError: state.BusinessError,
  ROLES_MANAGER_UP: ['owner', 'admin', 'manager'],
}));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/invoice-counter', () => ({
  getNextInvoiceNumber: vi.fn().mockResolvedValue('CN-2026-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2026-000001'),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (_key: string, _agency: string, _operation: string, fn: () => Promise<unknown>) => fn(),
  markIdempotencyComplete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));

const tables = vi.hoisted(() => ({
  invoices: {
    name: 'invoices', id: 'id', agencyId: 'agencyId', type: 'type', status: 'status',
    totalHalalas: 'totalHalalas', paidHalalas: 'paidHalalas',
    creditedHalalas: 'creditedHalalas', cancelledHalalas: 'cancelledHalalas',
  },
  journalEntries: { name: 'journalEntries' },
  journalLines: {
    name: 'journalLines', entryId: 'entryId', accountCode: 'accountCode',
    accountNameAr: 'accountNameAr', accountNameEn: 'accountNameEn',
    debitHalalas: 'debitHalalas', creditHalalas: 'creditHalalas',
  },
  bookingLines: { name: 'bookingLines', bookingId: 'bookingId', agencyId: 'agencyId', supplierId: 'supplierId', totalCostHalalas: 'totalCostHalalas' },
  suppliers: { name: 'suppliers', id: 'id', agencyId: 'agencyId', balanceHalalas: 'balanceHalalas' },
}));
vi.mock('@/lib/schema', () => tables);

const dbMock = vi.hoisted(() => {
  const chainFor = (result: unknown[]) => {
    const promise = Promise.resolve(result);
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate']) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain['then'] = promise.then.bind(promise);
    chain['catch'] = promise.catch.bind(promise);
    return chain;
  };

  const tx = {
    select: vi.fn(() => chainFor(state.selectResults.shift() ?? [])),
    update: vi.fn(() => {
      const chain = chainFor(state.updateResult.value);
      chain['set'] = vi.fn().mockReturnValue(chain);
      return chain;
    }),
    insert: vi.fn((table: unknown) => {
      const call: { table: unknown; values?: unknown } = { table };
      state.inserts.push(call);
      const chain = chainFor([]);
      chain['values'] = vi.fn((values: unknown) => { call.values = values; return chain; });
      return chain;
    }),
  };

  return { tx, db: { transaction: vi.fn((fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) } };
});
vi.mock('@/lib/db', () => ({ db: dbMock.db }));

import { POST } from '@/app/api/invoices/credit-note/route';

function makeRequest(totalHalalas = 60_000) {
  return new Request('http://localhost/api/invoices/credit-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalInvoiceId: 'invoice-1',
      subtotalHalalas: totalHalalas,
      vatHalalas: 0,
      totalHalalas,
      reason: 'تخفيض تجريبي',
      idempotencyKey: 'credit-original-test',
    }),
  });
}

function original(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1', agencyId: 'agency-1', invoiceNumber: 'INV-2026-000001',
    type: '388', status: 'partial', totalHalalas: 100_000, paidHalalas: 30_000,
    creditedHalalas: 20_000, cancelledHalalas: 20_000,
    journalEntryId: 'journal-original', isEInvoice: false, bookingId: null,
    ...overrides,
  };
}

describe('POST /api/invoices/credit-note — linked original lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selectResults.length = 0;
    state.inserts.length = 0;
    state.updateResult.value = [];
    state.verifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'manager' });
    state.assertRole.mockReturnValue(undefined);
  });

  it('credits open receivables first and puts only the excess in customer deposits', async () => {
    const updated = original({ creditedHalalas: 80_000, cancelledHalalas: 80_000, status: 'paid' });
    state.selectResults.push(
      [original()],
      [
        { accountCode: '1120', accountNameAr: 'العملاء', accountNameEn: 'AR', debitHalalas: 100_000, creditHalalas: 0 },
        { accountCode: '4100', accountNameAr: 'الإيراد', accountNameEn: 'Revenue', debitHalalas: 0, creditHalalas: 100_000 },
      ],
    );
    state.updateResult.value = [updated];

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    const journalLines = state.inserts.find(call => call.table === tables.journalLines)?.values as Array<{
      accountCode: string; debitHalalas: number; creditHalalas: number;
    }>;
    const creditFor = (code: string) => journalLines
      .filter(line => line.accountCode === code)
      .reduce((sum, line) => sum + line.creditHalalas, 0);
    expect(creditFor('1120')).toBe(50_000);
    expect(creditFor('2300')).toBe(10_000);
    expect(journalLines.reduce((sum, line) => sum + line.debitHalalas, 0))
      .toBe(journalLines.reduce((sum, line) => sum + line.creditHalalas, 0));
  });

  it('rejects a cumulative over-credit when the atomic reservation loses the race', async () => {
    state.selectResults.push([original()]);
    state.updateResult.value = [];
    const response = await POST(makeRequest(90_000));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/يتجاوز/) });
  });

  it('rejects linking a new note to an already closed original invoice', async () => {
    state.selectResults.push([original({ status: 'credit_noted' })]);
    const response = await POST(makeRequest());
    expect(response.status).toBe(422);
  });
});
