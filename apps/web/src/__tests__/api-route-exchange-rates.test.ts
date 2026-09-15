import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}));

const { ApiAuthError, mockVerifyAuth, mockAssertRole, inserted, mockTransaction } = vi.hoisted(() => ({
  ApiAuthError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
  mockVerifyAuth: vi.fn(),
  mockAssertRole: vi.fn(),
  inserted: [] as unknown[],
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth, assertRole: mockAssertRole, ApiAuthError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));
vi.mock('@/lib/schema', () => ({
  exchangeRates: { table: 'exchange_rates', agencyId: 'agency_id', fromCurrency: 'from', toCurrency: 'to', effectiveDate: 'date' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { transaction: mockTransaction } }));

import { POST } from '@/app/api/banking/rates/route';

const request = (body: unknown) => new Request('http://localhost/api/banking/rates', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/banking/rates — canonical currency data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserted.length = 0;
    mockVerifyAuth.mockResolvedValue({ agencyId: 'agency-1', role: 'accountant' });
    mockAssertRole.mockReturnValue(undefined);
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      insert: () => ({ values: async (value: unknown) => { inserted.push(value); } }),
    }));
  });

  it('normalizes currency codes before storing the rate', async () => {
    const response = await POST(request({ fromCurrency: ' usd ', toCurrency: 'sar', rate: 3.75, effectiveDate: '2026-09-14' }));
    expect(response.status).toBe(200);
    expect(inserted[0]).toMatchObject({ fromCurrency: 'USD', toCurrency: 'SAR', rate: 37_500 });
  });

  it.each([
    ['same source and target', { fromCurrency: 'SAR', toCurrency: 'sar', rate: 1, effectiveDate: '2026-09-14' }],
    ['invalid calendar date', { fromCurrency: 'USD', toCurrency: 'SAR', rate: 3.75, effectiveDate: '2026-02-30' }],
    ['non-ISO date', { fromCurrency: 'USD', toCurrency: 'SAR', rate: 3.75, effectiveDate: '14/09/2026' }],
    ['rate rounded to zero', { fromCurrency: 'USD', toCurrency: 'SAR', rate: 0.00001, effectiveDate: '2026-09-14' }],
  ])('rejects %s', async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
