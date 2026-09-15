import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

const mocks = vi.hoisted(() => {
  class ApiAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  }
  class BusinessError extends Error {
    constructor(message: string, public status: number) { super(message); }
  }

  const selectResults: unknown[][] = [];
  const inserted: Array<{ table: string; values: unknown }> = [];
  const updated: Array<{ table: string; values: unknown }> = [];

  const chain = (rows: unknown[]) => {
    const promise = Promise.resolve(rows);
    const value: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit', 'orderBy']) value[method] = vi.fn().mockReturnValue(value);
    value.then = promise.then.bind(promise);
    value.catch = promise.catch.bind(promise);
    return value;
  };

  const tx = {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    insert: vi.fn((table: { _name?: string }) => {
      const value = chain([]);
      value.values = vi.fn((rows: unknown) => {
        inserted.push({ table: table._name ?? 'unknown', values: rows });
        return value;
      });
      return value;
    }),
    update: vi.fn((table: { _name?: string }) => {
      const rows = table._name === 'invoices' ? [{ id: 'inv-1' }] : [];
      const value = chain(rows);
      value.set = vi.fn((values: unknown) => {
        updated.push({ table: table._name ?? 'unknown', values });
        return value;
      });
      value.returning = vi.fn().mockReturnValue(value);
      return value;
    }),
  };

  const db = { transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)) };

  return {
    ApiAuthError,
    BusinessError,
    db,
    inserted,
    updated,
    selectResults,
    verifyAuth: vi.fn(),
    assertRole: vi.fn(),
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: mocks.verifyAuth,
  assertRole: mocks.assertRole,
  ApiAuthError: mocks.ApiAuthError,
  BusinessError: mocks.BusinessError,
  ROLES_ACCOUNTANT_UP: ['owner', 'admin', 'manager', 'accountant'],
  ROLES_ADMIN_ONLY: ['owner', 'admin'],
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock('@/lib/idempotency', () => ({
  withIdempotency: (_key: string, _agency: string, _operation: string, fn: () => Promise<unknown>) => fn(),
  markIdempotencyComplete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/invoice-counter', () => ({
  getNextReceiptNumber: vi.fn().mockResolvedValue('RCT-2026-000001'),
  getNextJournalNumber: vi.fn().mockResolvedValue('JE-2026-000001'),
}));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));
vi.mock('@/lib/schema', () => ({
  receiptVouchers: { _name: 'receiptVouchers', id: 'id', agencyId: 'agencyId', invoiceId: 'invoiceId', originalVoucherId: 'originalVoucherId' },
  invoices: { _name: 'invoices', id: 'id', agencyId: 'agencyId', paidHalalas: 'paidHalalas', totalHalalas: 'totalHalalas', status: 'status' },
  bookings: { _name: 'bookings', id: 'id', agencyId: 'agencyId', paidHalalas: 'paidHalalas' },
  journalEntries: { _name: 'journalEntries' },
  journalLines: { _name: 'journalLines' },
}));

import { POST as createReceipt } from '@/app/api/receipts/create/route';
import { POST as applyReceipt } from '@/app/api/receipts/[id]/apply/route';
import { POST as reverseReceipt } from '@/app/api/receipts/[id]/reverse/route';

const INVOICE = {
  id: 'inv-1', agencyId: 'agency-1', invoiceNumber: 'INV-1', bookingId: 'booking-1',
  buyerNameAr: 'العميل الصحيح', totalHalalas: 10_000, paidHalalas: 0, status: 'issued',
};
const VOUCHER = {
  id: 'receipt-1', agencyId: 'agency-1', voucherNumber: 'RCT-1', amountHalalas: 5_000,
  invoiceId: null, isRefund: 'false',
};

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('دورة سند القبض', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults.length = 0;
    mocks.inserted.length = 0;
    mocks.updated.length = 0;
    mocks.verifyAuth.mockResolvedValue({ uid: 'user-1', agencyId: 'agency-1', role: 'accountant' });
  });

  it('يرفض طريقة دفع غير معروفة قبل بدء المعاملة', async () => {
    const res = await createReceipt(request('/api/receipts/create', {
      customerNameAr: 'عميل', amountHalalas: 5_000, paymentMethod: 'crypto',
    }));
    expect(res.status).toBe(400);
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it.each(['draft', 'pending', 'paid', 'cancelled', 'refunded', 'credit_noted'])(
    'يرفض ربط سند جديد بفاتورة حالتها %s', async (status) => {
      mocks.selectResults.push([{ ...INVOICE, status }]);
      const res = await createReceipt(request('/api/receipts/create', {
        customerNameAr: 'اسم مضلل', amountHalalas: 5_000, paymentMethod: 'cash', invoiceId: 'inv-1',
      }));
      expect(res.status).toBe(422);
    },
  );

  it('يستخدم اسم عميل الفاتورة الموثوق ويزامن رصيد الحجز', async () => {
    mocks.selectResults.push([INVOICE]);
    const res = await createReceipt(request('/api/receipts/create', {
      customerNameAr: 'اسم مضلل', amountHalalas: 5_000, paymentMethod: 'cash', invoiceId: 'inv-1',
    }));
    expect(res.status).toBe(200);
    const receipt = mocks.inserted.find((item) => item.table === 'receiptVouchers')?.values as { customerName?: string };
    expect(receipt.customerName).toBe('العميل الصحيح');
    expect(receipt).toEqual(expect.objectContaining({ bookingId: 'booking-1' }));
    expect(mocks.updated.some((item) => item.table === 'bookings')).toBe(true);
  });

  it.each(['draft', 'pending', 'paid', 'cancelled', 'refunded', 'credit_noted'])(
    'يرفض تطبيق وديعة على فاتورة حالتها %s', async (status) => {
      mocks.selectResults.push([VOUCHER], [{ ...INVOICE, status }]);
      const res = await applyReceipt(
        request('/api/receipts/receipt-1/apply', { invoiceId: 'inv-1' }),
        { params: { id: 'receipt-1' } },
      );
      expect(res.status).toBe(422);
    },
  );

  it('يحدث رصيد الحجز عند تطبيق الوديعة على فاتورة صالحة', async () => {
    mocks.selectResults.push([VOUCHER], [INVOICE]);
    const res = await applyReceipt(
      request('/api/receipts/receipt-1/apply', { invoiceId: 'inv-1' }),
      { params: { id: 'receipt-1' } },
    );
    expect(res.status).toBe(200);
    expect(mocks.updated.some((item) => item.table === 'bookings')).toBe(true);
    expect(mocks.updated.find((item) => item.table === 'receiptVouchers')?.values)
      .toEqual(expect.objectContaining({ invoiceId: 'inv-1', bookingId: 'booking-1' }));
  });

  it('يعيد الفاتورة إلى صادرة عند عكس تحصيلها بالكامل ويزامن الحجز', async () => {
    mocks.selectResults.push([{
      ...VOUCHER,
      invoiceId: 'inv-1', bookingId: 'booking-1', method: 'cash', customerName: 'العميل',
    }], []);
    const res = await reverseReceipt(
      request('/api/receipts/receipt-1/reverse', { reason: 'قيد مكرر' }),
      { params: { id: 'receipt-1' } },
    );
    expect(res.status).toBe(200);
    const invoiceUpdate = mocks.updated.find((item) => item.table === 'invoices')?.values as { status?: string };
    expect(invoiceUpdate.status).toContain("'issued'");
    expect(invoiceUpdate.status).not.toContain("'refunded'");
    expect(mocks.updated.some((item) => item.table === 'bookings')).toBe(true);
  });
});
