import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
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
  mockAssertPeriodOpen,
  mockTx,
  updateCalls,
  insertCalls,
  selectResults,
  invoiceUpdateResult,
} = vi.hoisted(() => {
  class ApiAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  class BusinessError extends Error {
    status: number;
    constructor(message: string, status = 400) { super(message); this.status = status; }
  }

  const selectResults: unknown[][] = [];
  const updateCalls: Array<{ table: unknown; values?: Record<string, unknown> }> = [];
  const insertCalls: Array<{ table: unknown; values?: Record<string, unknown> }> = [];
  const invoiceUpdateResult = { value: [{ paidHalalas: 10_000 }] as unknown[] };

  const thenable = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit', 'orderBy', 'offset']) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain['then'] = promise.then.bind(promise);
    chain['catch'] = promise.catch.bind(promise);
    return chain;
  };

  const mockTx = {
    select: vi.fn(() => thenable(selectResults.shift() ?? [])),
    insert: vi.fn((table: unknown) => {
      const call: { table: unknown; values?: Record<string, unknown> } = { table };
      insertCalls.push(call);
      const chain = thenable([]);
      chain['values'] = vi.fn((values: Record<string, unknown>) => {
        call.values = values;
        return chain;
      });
      chain['onConflictDoNothing'] = vi.fn().mockReturnValue(chain);
      chain['onConflictDoUpdate'] = vi.fn().mockReturnValue(chain);
      chain['returning'] = vi.fn().mockReturnValue(chain);
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      const call: { table: unknown; values?: Record<string, unknown> } = { table };
      const index = updateCalls.push(call) - 1;
      const chain = thenable(index === 0 ? invoiceUpdateResult.value : []);
      chain['set'] = vi.fn((values: Record<string, unknown>) => {
        call.values = values;
        return chain;
      });
      chain['where'] = vi.fn().mockReturnValue(chain);
      chain['returning'] = vi.fn().mockReturnValue(chain);
      return chain;
    }),
  };

  return {
    ApiAuthError,
    BusinessError,
    mockVerifyAuth: vi.fn(),
    mockAssertRole: vi.fn(),
    mockAssertPeriodOpen: vi.fn(),
    mockTx,
    updateCalls,
    insertCalls,
    selectResults,
    invoiceUpdateResult,
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth,
  assertRole: mockAssertRole,
  ApiAuthError,
  BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));

vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: mockAssertPeriodOpen }));
vi.mock('@/lib/invoice-counter', () => ({
  getNextInvoiceNumber: vi.fn().mockResolvedValue('CN-2026-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2026-000001'),
}));
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
    name: 'invoices', id: 'id', agencyId: 'agencyId', status: 'status',
    paidHalalas: 'paidHalalas', creditedHalalas: 'creditedHalalas',
    cancelledHalalas: 'cancelledHalalas', totalHalalas: 'totalHalalas',
  },
  bookings: { name: 'bookings', id: 'id', agencyId: 'agencyId', paidHalalas: 'paidHalalas' },
  payments: { name: 'payments' },
  journalEntries: { name: 'journalEntries' },
  journalLines: { name: 'journalLines', entryId: 'entryId', accountCode: 'accountCode', accountNameAr: 'accountNameAr', accountNameEn: 'accountNameEn', debitHalalas: 'debitHalalas', creditHalalas: 'creditHalalas' },
  bookingLines: { name: 'bookingLines', bookingId: 'bookingId', agencyId: 'agencyId', status: 'status' },
  suppliers: { name: 'suppliers', id: 'id', agencyId: 'agencyId', balanceHalalas: 'balanceHalalas' },
  paymentPlans: { name: 'paymentPlans', bookingId: 'bookingId', agencyId: 'agencyId', status: 'status' },
}));

vi.mock('@/lib/schema', () => tables);
vi.mock('@/lib/db', () => ({
  db: { transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)) },
}));

import { POST } from '@/app/api/refunds/process/route';

const user = { uid: 'user-1', agencyId: 'agency-1', role: 'accountant' };

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/refunds/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queueScenario(overrides: Record<string, unknown> = {}) {
  selectResults.push(
    [{
      id: 'invoice-1', agencyId: 'agency-1', bookingId: 'booking-1',
      invoiceNumber: 'INV-2026-000001', type: '388', status: 'paid',
      subtotalHalalas: 100_000, vatHalalas: 0, totalHalalas: 100_000,
      paidHalalas: 100_000, creditedHalalas: 0, cancelledHalalas: 0,
      items: null, isEInvoice: false, journalEntryId: 'journal-original',
      sellerNameAr: 'وكالة اختبار', buyerNameAr: 'عميل اختبار',
      customerId: null, ...overrides,
    }],
    [{ id: 'booking-1', agencyId: 'agency-1', status: 'confirmed', paidHalalas: 100_000, costPriceHalalas: 0, details: { revenueModel: 'principal' } }],
    [],
    [
      { accountCode: '1120', accountNameAr: 'العملاء', accountNameEn: 'AR', debitHalalas: 100_000, creditHalalas: 0 },
      { accountCode: '4100', accountNameAr: 'الإيراد', accountNameEn: 'Revenue', debitHalalas: 0, creditHalalas: 100_000 },
    ],
  );
}

describe('POST /api/refunds/process — actual route lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    updateCalls.length = 0;
    insertCalls.length = 0;
    invoiceUpdateResult.value = [{ paidHalalas: 10_000 }];
    mockVerifyAuth.mockResolvedValue(user);
    mockAssertRole.mockReturnValue(undefined);
    mockAssertPeriodOpen.mockResolvedValue(undefined);
  });

  it('keeps the declared fee collected and closes the invoice without a false receivable', async () => {
    queueScenario();

    const response = await POST(request({
      bookingId: 'booking-1',
      originalInvoiceId: 'invoice-1',
      refundAmountHalalas: 90_000,
      cancellationFeeHalalas: 10_000,
      cancelledTotalHalalas: 100_000,
      reason: 'إلغاء كامل مع رسوم معلنة',
      idempotencyKey: 'refund-route-test-1',
    }));

    expect(response.status).toBe(200);
    const invoiceUpdate = updateCalls[0]?.values;
    expect(invoiceUpdate).toMatchObject({
      paidHalalas: 10_000,
      creditedHalalas: 90_000,
      cancelledHalalas: 100_000,
      status: 'refunded',
    });

    const creditNote = insertCalls.find(call => call.table === tables.invoices)?.values;
    expect(creditNote).toMatchObject({ type: '381', totalHalalas: 90_000, paidHalalas: 90_000 });
    const refundPayment = insertCalls.find(call => call.table === tables.payments)?.values;
    expect(refundPayment).toMatchObject({ amountHalalas: -90_000, invoiceId: 'invoice-1' });

    expect(updateCalls.find(call => call.table === tables.bookings)?.values).toMatchObject({ status: 'cancelled', paidHalalas: 0 });
    expect(updateCalls.find(call => call.table === tables.bookingLines)?.values).toMatchObject({ status: 'cancelled' });
    expect(updateCalls.find(call => call.table === tables.paymentPlans)?.values).toMatchObject({ status: 'cancelled' });
  });

  it('finishes a prior partial cancellation without exceeding the original invoice', async () => {
    queueScenario({ paidHalalas: 70_000, creditedHalalas: 30_000, cancelledHalalas: 30_000, status: 'partial' });
    const response = await POST(request({
      bookingId: 'booking-1', originalInvoiceId: 'invoice-1',
      refundAmountHalalas: 70_000, cancellationFeeHalalas: 0,
      cancelledTotalHalalas: 70_000, reason: 'إكمال الإلغاء',
    }));

    expect(response.status).toBe(200);
    expect(updateCalls[0]?.values).toMatchObject({
      paidHalalas: 0,
      creditedHalalas: 100_000,
      cancelledHalalas: 100_000,
      status: 'refunded',
    });
  });

  it('returns a conflict when a concurrent refund already consumed the invoice balance', async () => {
    queueScenario();
    invoiceUpdateResult.value = [];
    const response = await POST(request({
      bookingId: 'booking-1', originalInvoiceId: 'invoice-1',
      refundAmountHalalas: 100_000, cancellationFeeHalalas: 0,
      reason: 'استرداد متزامن',
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/استرداد آخر/) });
  });
});
