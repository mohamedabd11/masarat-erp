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
  mockLookupFxRate,
  selectResults,
  inserted,
  mockTransaction,
} = vi.hoisted(() => {
  class ApiAuthError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  }
  class BusinessError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  }
  return {
    ApiAuthError,
    BusinessError,
    mockVerifyAuth: vi.fn(),
    mockAssertRole: vi.fn(),
    mockLookupFxRate: vi.fn(),
    selectResults: [] as unknown[][],
    inserted: [] as Array<{ table: unknown; values: unknown }>,
    mockTransaction: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth,
  assertRole: mockAssertRole,
  ApiAuthError,
  BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));

vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (_key: string, _agency: string, _operation: string, fn: () => Promise<unknown>) => fn(),
  markIdempotencyComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/invoice-counter', () => ({
  getNextPaymentVoucherNumber: vi.fn().mockResolvedValue('PV-2026-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2026-000001'),
}));

vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/fx', () => ({
  lookupFxRate: mockLookupFxRate,
  fxToHalalas: (minor: number, rate: number) => Math.round(minor * rate / 10_000),
}));

vi.mock('@/lib/schema', () => ({
  agencies: { id: 'agency_id', isVatRegistered: 'is_vat_registered' },
  bookings: { id: 'booking_id', agencyId: 'booking_agency_id' },
  suppliers: { id: 'supplier_id', agencyId: 'supplier_agency_id', balanceHalalas: 'balance', updatedAt: 'updated_at' },
  supplierPayments: { table: 'supplier_payments' },
  journalEntries: { table: 'journal_entries' },
  journalLines: { table: 'journal_lines' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  sql: vi.fn((parts: TemplateStringsArray) => parts.join('')),
}));

const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {};
  const promise = Promise.resolve(rows);
  for (const method of ['from', 'where', 'limit']) chain[method] = vi.fn().mockReturnValue(chain);
  chain['then'] = promise.then.bind(promise);
  chain['catch'] = promise.catch.bind(promise);
  return chain;
};

const tx = {
  select: vi.fn(() => makeSelectChain(selectResults.shift() ?? [])),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn(async (values: unknown) => { inserted.push({ table, values }); return []; }),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  })),
};

vi.mock('@/lib/db', () => ({
  db: { transaction: mockTransaction },
}));

import { POST } from '@/app/api/supplier-payments/create/route';

const validBody = {
  payeeName: 'مورد تجريبي',
  expenseCategory: 'supplier',
  amountHalalas: 115_000,
  paymentMethod: 'bank_transfer',
};

const request = (body: unknown) => new Request('http://localhost/api/supplier-payments/create', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/supplier-payments/create — business input integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    inserted.length = 0;
    mockVerifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'accountant' });
    mockAssertRole.mockReturnValue(undefined);
    mockLookupFxRate.mockResolvedValue(null);
    mockTransaction.mockImplementation((callback: (arg: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it.each([
    ['unknown expense category', { ...validBody, expenseCategory: 'mystery' }],
    ['unknown payment method', { ...validBody, paymentMethod: 'crypto' }],
    ['fractional VAT', { ...validBody, vatAmountHalalas: 1_500.5 }],
    ['VAT equal to the entire payment', { ...validBody, vatAmountHalalas: 115_000 }],
    ['fractional original FX amount', { ...validBody, fxOriginalHalalas: 100_000.5 }],
  ])('rejects %s', async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects input VAT for an agency that is not VAT registered', async () => {
    selectResults.push([{ isVatRegistered: false }]);
    const response = await POST(request({ ...validBody, vatAmountHalalas: 15_000 }));
    expect(response.status).toBe(422);
  });

  it('rejects combining input VAT with a foreign-currency settlement', async () => {
    const response = await POST(request({
      ...validBody,
      vatAmountHalalas: 15_000,
      foreignCurrency: 'USD',
      foreignAmountMinor: 30_000,
      fxOriginalHalalas: 110_000,
    }));
    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects a supplier id that does not belong to the authenticated agency', async () => {
    selectResults.push([{ isVatRegistered: true }], []);
    const response = await POST(request({ ...validBody, supplierId: 'supplier-from-another-agency' }));
    expect(response.status).toBe(404);
  });

  it('accepts a valid VAT payment for a VAT-registered agency', async () => {
    selectResults.push([{ isVatRegistered: true }]);
    const response = await POST(request({ ...validBody, vatAmountHalalas: 15_000 }));
    expect(response.status).toBe(200);
  });
});
