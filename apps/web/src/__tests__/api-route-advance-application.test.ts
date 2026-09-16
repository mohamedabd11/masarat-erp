import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}));

const mocks = vi.hoisted(() => {
  class ApiAuthError extends Error { constructor(message: string, public status: number) { super(message); } }
  class BusinessError extends Error { constructor(message: string, public status: number) { super(message); } }
  const selected: unknown[][] = [];
  const updated: Array<{ table: string; values: unknown }> = [];
  const thenable = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const chain: Record<string, unknown> = {};
    for (const name of ['from', 'where', 'returning']) chain[name] = vi.fn().mockReturnValue(chain);
    chain.then = promise.then.bind(promise);
    chain.catch = promise.catch.bind(promise);
    return chain;
  };
  const tx = {
    select: vi.fn(() => thenable(selected.shift() ?? [])),
    insert: vi.fn(() => {
      const chain = thenable([]);
      chain.values = vi.fn().mockReturnValue(chain);
      return chain;
    }),
    update: vi.fn((table: { _name: string }) => {
      const result = table._name === 'invoices'
        ? [{ paidHalalas: 5_000, status: 'partial' }]
        : table._name === 'receiptVouchers' ? [{ id: 'receipt-1' }] : [];
      const chain = thenable(result);
      chain.set = vi.fn((values: unknown) => { updated.push({ table: table._name, values }); return chain; });
      return chain;
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
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/invoice-counter', () => ({ getNextJournalNumber: vi.fn().mockResolvedValue('JE-1') }));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})), and: vi.fn((...values: unknown[]) => ({ values })),
  isNull: vi.fn(() => ({})), sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));
vi.mock('@/lib/schema', () => ({
  invoices: { _name: 'invoices', id: 'id', agencyId: 'agencyId', status: 'status', paidHalalas: 'paidHalalas', creditedHalalas: 'creditedHalalas', totalHalalas: 'totalHalalas' },
  receiptVouchers: { _name: 'receiptVouchers', id: 'id', agencyId: 'agencyId', invoiceId: 'invoiceId' },
  bookings: { _name: 'bookings', id: 'id', agencyId: 'agencyId', paidHalalas: 'paidHalalas' },
  journalEntries: { _name: 'journalEntries' }, journalLines: { _name: 'journalLines' },
}));

import { POST } from '@/app/api/invoices/[id]/apply-advance/route';

const INVOICE = {
  id: 'inv-1', agencyId: 'agency-1', invoiceNumber: 'INV-1', bookingId: 'booking-1', customerId: 'cust-1',
  totalHalalas: 10_000, paidHalalas: 0, creditedHalalas: 0, status: 'issued',
};
const VOUCHER = {
  id: 'receipt-1', agencyId: 'agency-1', voucherNumber: 'RCT-1', customerId: 'cust-1',
  bookingId: null, invoiceId: null, isRefund: 'false', amountHalalas: 5_000,
};
function request(body: unknown) {
  return new Request('http://localhost/api/invoices/inv-1/apply-advance', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('تطبيق الدفعة المقدمة', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.selected.length = 0; mocks.updated.length = 0;
    mocks.verifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'accountant' });
  });

  it('يرفض مبلغاً كسرياً قبل بدء المعاملة', async () => {
    const res = await POST(request({ voucherId: 'receipt-1', amountHalalas: 99.5 }), { params: { id: 'inv-1' } });
    expect(res.status).toBe(400);
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it.each(['draft', 'pending', 'paid', 'cancelled', 'refunded', 'credit_noted'])(
    'يرفض الفاتورة غير القابلة للتحصيل (%s)', async (status) => {
      mocks.selected.push([{ ...INVOICE, status }]);
      const res = await POST(request({ voucherId: 'receipt-1' }), { params: { id: 'inv-1' } });
      expect(res.status).toBe(422);
    },
  );

  it('لا يسمح بتطبيق جزء من سند ثم فقدان الجزء المتبقي', async () => {
    mocks.selected.push([INVOICE], [VOUCHER]);
    const res = await POST(request({ voucherId: 'receipt-1', amountHalalas: 2_000 }), { params: { id: 'inv-1' } });
    expect(res.status).toBe(400);
  });

  it('يرفض تطبيق سند يتجاوز الرصيد بعد إشعار دائن جزئي', async () => {
    mocks.selected.push([{ ...INVOICE, creditedHalalas: 6_000, status: 'partial' }], [VOUCHER]);
    const res = await POST(request({ voucherId: 'receipt-1' }), { params: { id: 'inv-1' } });
    expect(res.status).toBe(400);
  });

  it('يحدّث الحجز ويربط السند بالفاتورة والحجز عند التطبيق الكامل', async () => {
    mocks.selected.push([INVOICE], [VOUCHER]);
    const res = await POST(request({ voucherId: 'receipt-1' }), { params: { id: 'inv-1' } });
    expect(res.status).toBe(200);
    expect(mocks.updated.some((item) => item.table === 'bookings')).toBe(true);
    expect(mocks.updated.find((item) => item.table === 'receiptVouchers')?.values)
      .toEqual(expect.objectContaining({ invoiceId: 'inv-1', bookingId: 'booking-1' }));
  });
});
