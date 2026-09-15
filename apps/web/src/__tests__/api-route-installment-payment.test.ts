import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}));

const mocks = vi.hoisted(() => {
  class ApiAuthError extends Error { constructor(message: string, public status: number) { super(message); } }
  class BusinessError extends Error { constructor(message: string, public status: number) { super(message); } }
  const selected: unknown[][] = [];
  const updated: string[] = [];
  const chain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const value: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'returning']) value[method] = vi.fn().mockReturnValue(value);
    value.then = promise.then.bind(promise);
    value.catch = promise.catch.bind(promise);
    return value;
  };
  const tx = {
    select: vi.fn(() => chain(selected.shift() ?? [])),
    insert: vi.fn(() => { const value = chain([]); value.values = vi.fn().mockReturnValue(value); return value; }),
    update: vi.fn((table: { _name: string }) => {
      updated.push(table._name);
      const rows = table._name === 'invoices'
        ? [{ paidHalalas: 5_000, totalHalalas: 10_000 }]
        : table._name === 'paymentPlanInstallments' ? [{ id: 'inst-1' }] : [];
      const value = chain(rows);
      value.set = vi.fn().mockReturnValue(value);
      return value;
    }),
  };
  const db = { transaction: vi.fn((fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) };
  return { ApiAuthError, BusinessError, selected, updated, db, verifyAuth: vi.fn(), assertRole: vi.fn() };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mocks.verifyAuth, assertRole: mocks.assertRole,
  ApiAuthError: mocks.ApiAuthError, BusinessError: mocks.BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (_key: string, _agency: string, _operation: string, fn: () => Promise<unknown>) => fn(),
  markIdempotencyComplete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/invoice-counter', () => ({
  getNextReceiptNumber: vi.fn().mockResolvedValue('RCT-1'), getNextJournalNumber: vi.fn().mockResolvedValue('JE-1'),
}));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})), and: vi.fn((...values: unknown[]) => ({ values })),
  inArray: vi.fn(() => ({})), sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));
vi.mock('@/lib/schema', () => ({
  bookings: { _name: 'bookings', id: 'id', agencyId: 'agencyId', status: 'status', paidHalalas: 'paidHalalas' },
  invoices: { _name: 'invoices', id: 'id', agencyId: 'agencyId', bookingId: 'bookingId', status: 'status', paidHalalas: 'paidHalalas', totalHalalas: 'totalHalalas' },
  payments: { _name: 'payments' }, paymentPlans: { _name: 'paymentPlans', id: 'id', agencyId: 'agencyId', bookingId: 'bookingId', status: 'status' },
  paymentPlanInstallments: { _name: 'paymentPlanInstallments', id: 'id', agencyId: 'agencyId', bookingId: 'bookingId', planId: 'planId', status: 'status' },
  journalEntries: { _name: 'journalEntries' }, journalLines: { _name: 'journalLines' },
}));

import { POST } from '@/app/api/bookings/[id]/payment-plan/installments/[installmentId]/pay/route';

const INSTALLMENT = { id: 'inst-1', agencyId: 'agency-1', bookingId: 'booking-1', invoiceId: 'inv-1', planId: 'plan-1', installmentNumber: 1, amountHalalas: 5_000, status: 'pending' };
const INVOICE = { id: 'inv-1', agencyId: 'agency-1', bookingId: 'booking-1', invoiceNumber: 'INV-1', customerId: 'cust-1', buyerNameAr: 'عميل', totalHalalas: 10_000, paidHalalas: 0, status: 'issued' };
const context = { params: { id: 'booking-1', installmentId: 'inst-1' } };
function request() {
  return new Request('http://localhost/api/bookings/booking-1/payment-plan/installments/inst-1/pay', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'cash' }),
  });
}

describe('دفع أقساط العملاء', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.selected.length = 0; mocks.updated.length = 0;
    mocks.verifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'accountant' });
  });

  it('يرفض دفع قسط تابع لخطة ملغاة', async () => {
    mocks.selected.push([INSTALLMENT], [{ status: 'cancelled' }]);
    const res = await POST(request(), context);
    expect(res.status).toBe(422);
  });

  it('يرفض دفع قسط على فاتورة غير قابلة للتحصيل', async () => {
    mocks.selected.push([INSTALLMENT], [{ status: 'active' }], [{ ...INVOICE, status: 'draft' }]);
    const res = await POST(request(), context);
    expect(res.status).toBe(422);
  });

  it('يحدّث الفاتورة والحجز والقسط عند الدفع الصحيح', async () => {
    mocks.selected.push([INSTALLMENT], [{ status: 'active' }], [INVOICE], [{ status: 'confirmed' }], [INSTALLMENT]);
    const res = await POST(request(), context);
    expect(res.status).toBe(200);
    expect(mocks.updated).toEqual(expect.arrayContaining(['invoices', 'bookings', 'paymentPlanInstallments']));
  });
});
