import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

const { ApiAuthError, mockVerifyAuth, mockAssertRole, mockTransaction } = vi.hoisted(() => {
  class ApiAuthError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  }

  return {
    ApiAuthError,
    mockVerifyAuth: vi.fn(),
    mockAssertRole: vi.fn(),
    mockTransaction: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth,
  assertRole: mockAssertRole,
  ApiAuthError,
  ROLES_AGENT_UP: ['owner', 'admin', 'manager', 'accountant', 'staff', 'agent'],
}));

vi.mock('@/lib/schema', () => ({
  customers: {
    id: 'id', agencyId: 'agencyId', vatNumber: 'vatNumber', isActive: 'isActive',
    nameAr: 'nameAr', nameEn: 'nameEn', phone: 'phone', createdAt: 'createdAt',
  },
  bookings: { id: 'id', agencyId: 'agencyId', customerId: 'customerId', totalPriceHalalas: 'totalPriceHalalas' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  count: vi.fn(() => ({})),
  sum: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: mockTransaction,
    select: vi.fn(),
  },
}));

import { POST } from '@/app/api/customers/route';

describe('POST /api/customers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({ agencyId: 'agency-1', role: 'owner' });
  });

  it('creates a name-only customer when the form sends optional fields as null', async () => {
    let insertedValues: Record<string, unknown> | undefined;
    mockTransaction.mockImplementation(async (callback) => callback({
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValues = values;
          return { returning: async () => [{ ...values }] };
        },
      }),
    }));

    const response = await POST(new Request('http://localhost/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nameAr: 'حساب تجريبي',
        phone: null,
        email: null,
        nationalId: null,
        passportNumber: null,
        dateOfBirth: null,
        vatNumber: null,
        notes: null,
      }),
    }));

    expect(response.status).toBe(200);
    expect(insertedValues).toMatchObject({
      agencyId: 'agency-1',
      nameAr: 'حساب تجريبي',
      nameEn: null,
      phone: null,
      openingBalanceHalalas: 0,
      vatNumber: null,
    });
  });

  it('logs safe database diagnostics without exposing the submitted customer data', async () => {
    const cause = Object.assign(new Error('sensitive database detail'), {
      code: '42703',
      table: 'customers',
      column: 'vat_number',
      routine: 'errorMissingColumn',
    });
    mockTransaction.mockRejectedValue(Object.assign(new Error('Failed query with customer data'), { cause }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(new Request('http://localhost/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameAr: 'اسم لا يجب ظهوره في السجل' }),
    }));

    expect(response.status).toBe(500);
    const logged = String(consoleError.mock.calls[0]?.[0]);
    expect(logged).toContain('customer_create_failed');
    expect(logged).toContain('42703');
    expect(logged).toContain('vat_number');
    expect(logged).not.toContain('اسم لا يجب ظهوره في السجل');
    expect(logged).not.toContain('sensitive database detail');
    consoleError.mockRestore();
  });
});
