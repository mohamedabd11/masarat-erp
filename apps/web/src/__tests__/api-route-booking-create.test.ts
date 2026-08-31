import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

const {
  mockVerifyAuth,
  mockAssertRole,
  mockCheckRateLimit,
  mockAgencySelect,
  mockTransaction,
  inserted,
  ApiAuthError,
} = vi.hoisted(() => ({
  mockVerifyAuth: vi.fn(),
  mockAssertRole: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockAgencySelect: vi.fn(),
  mockTransaction: vi.fn(),
  inserted: new Map<string, unknown[]>(),
  ApiAuthError: class extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mockVerifyAuth,
  assertRole: mockAssertRole,
  ApiAuthError,
  ROLES_AGENT_UP: ['owner', 'admin', 'manager', 'accountant', 'staff', 'agent'],
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: () => '127.0.0.1',
  rateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/invoice-counter', () => ({
  getNextBookingNumber: vi.fn().mockResolvedValue('BK-26-000001'),
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/schema', () => ({
  agencies: { id: 'agency_id', isVatRegistered: 'is_vat_registered', vatRate: 'vat_rate' },
  bookings: { table: 'bookings' },
  bookingLines: { table: 'bookingLines' },
  bookingPassengers: { table: 'bookingPassengers' },
  VAT_RATE_BPS: { S: 1500, Z: 0, E: 0, O: 0 },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockAgencySelect }) }),
    transaction: mockTransaction,
  },
}));

import { POST } from '@/app/api/bookings/create/route';

describe('POST /api/bookings/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserted.clear();
    mockVerifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'owner' });
    mockAssertRole.mockReturnValue(undefined);
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockAgencySelect.mockResolvedValue([{ isVatRegistered: false, vatRate: 0 }]);
    mockTransaction.mockImplementation(async (callback) => callback({
      insert: (table: { table: string }) => ({
        values: async (values: unknown) => {
          inserted.set(table.table, Array.isArray(values) ? values : [values]);
        },
      }),
    }));
  });

  it('persists customer, trip, supplier, correct principal cost, and passengers atomically', async () => {
    const response = await POST(new Request('http://localhost/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'package',
        customerId: 'customer-1',
        customerName: { ar: 'عميل تجريبي', en: 'Test Customer' },
        customerPhone: '0500000000',
        supplierName: 'مورد تجريبي',
        supplierRef: 'SUP-1',
        destination: 'دبي',
        travelDate: '2026-10-01',
        returnDate: '2026-10-07',
        pricing: {
          revenueModel: 'principal',
          totalCost: 70_000,
          totalAmount: 115_000,
          vatAmount: 0,
          currency: 'SAR',
        },
        passengers: [{
          type: 'adult', nameAr: 'مسافر تجريبي', nameEn: 'Test Traveler',
          gender: 'male', passportNumber: 'T1234567', passportExpiry: '2028-12-31',
          nationality: 'السعودية',
        }],
        details: {},
      }),
    }));

    expect(response.status).toBe(200);
    expect(inserted.get('bookings')?.[0]).toMatchObject({
      customerNameAr: 'عميل تجريبي',
      customerNameEn: 'Test Customer',
      totalPriceHalalas: 115_000,
      costPriceHalalas: 70_000,
      profitHalalas: 45_000,
      details: expect.objectContaining({
        destination: 'دبي', departureDate: '2026-10-01', returnDate: '2026-10-07',
        supplierName: 'مورد تجريبي', supplierRef: 'SUP-1',
      }),
    });
    expect(inserted.get('bookingLines')?.[0]).toMatchObject({
      description: 'دبي',
      supplierName: 'مورد تجريبي',
      totalCostHalalas: 70_000,
      totalPriceExclVatHalalas: 115_000,
    });
    expect(inserted.get('bookingPassengers')?.[0]).toMatchObject({
      nameAr: 'مسافر تجريبي', type: 'ADT', gender: 'M', passportNumber: 'T1234567',
    });
  });

  it('keeps VAT out of agent profit and stores the selected tax rate', async () => {
    mockAgencySelect.mockResolvedValue([{ isVatRegistered: true, vatRate: 15 }]);
    const response = await POST(new Request('http://localhost/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'flight',
        customerName: { ar: 'عميل ضريبي', en: 'VAT Customer' },
        customerPhone: '0500000000',
        pricing: {
          revenueModel: 'agent',
          totalCost: 100_000,
          serviceFee: 10_000,
          vatAmount: 1_500,
          totalAmount: 111_500,
          vatCategory: 'S',
          vatRateBps: 1_500,
          currency: 'SAR',
        },
        details: {},
      }),
    }));

    expect(response.status).toBe(200);
    expect(inserted.get('bookings')?.[0]).toMatchObject({
      totalPriceHalalas: 111_500,
      costPriceHalalas: 100_000,
      profitHalalas: 10_000,
    });
    expect(inserted.get('bookingLines')?.[0]).toMatchObject({
      totalCostHalalas: 100_000,
      totalPriceExclVatHalalas: 110_000,
      vatHalalas: 1_500,
      vatRateBps: 1_500,
      revenueModel: 'agent',
    });
  });

  it('rejects a VAT amount that does not match the agent fee and tax rate', async () => {
    mockAgencySelect.mockResolvedValue([{ isVatRegistered: true, vatRate: 15 }]);
    const response = await POST(new Request('http://localhost/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'flight',
        customerName: { ar: 'عميل ضريبي' },
        customerPhone: '0500000000',
        pricing: {
          revenueModel: 'agent',
          totalCost: 100_000,
          serviceFee: 10_000,
          vatAmount: 15_000,
          totalAmount: 125_000,
          vatCategory: 'S',
          vatRateBps: 1_500,
        },
        details: {},
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'مبلغ الضريبة لا يطابق نموذج الإيراد ومعدل الضريبة',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
