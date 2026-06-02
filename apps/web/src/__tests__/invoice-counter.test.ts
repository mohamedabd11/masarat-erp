import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock db and schema before importing the module ───────────────────────────

vi.mock('@/lib/schema', () => ({
  agencyCounters: {
    agencyId: 'agencyId',
    counterType: 'counterType',
    currentValue: 'currentValue',
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: strings.join('?'),
    values,
  })),
}));

// ─── Mock db singleton used by nextCounter when no tx is passed ───────────────
// vi.mock is hoisted, so use vi.hoisted() to define variables that are safe to
// reference inside the factory.

const { mockDb, mockInsertChain, mockDbInsertResult } = vi.hoisted(() => {
  const mockDbInsertResult = { value: [{ currentValue: 1 }] };
  const mockInsertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbInsertResult.value)),
  };
  const mockDb = {
    insert: vi.fn().mockReturnValue(mockInsertChain),
  };
  return { mockDb, mockInsertChain, mockDbInsertResult };
});

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

import {
  getNextJournalNumber,
  getNextInvoiceNumber,
  getNextReceiptNumber,
  getNextPaymentVoucherNumber,
  getNextBookingNumber,
} from '@/lib/invoice-counter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx(currentValue: number) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ currentValue }]),
  };
  return {
    insert: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// ─── getNextJournalNumber ─────────────────────────────────────────────────────

describe('getNextJournalNumber', () => {

  // ── 1. First journal entry of year → JE-2024-000001 ──────────────────────

  it('أول قيد في 2024 → JE-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(result).toBe('JE-2024-000001');
  });

  // ── 2. Second call → JE-2024-000002 ──────────────────────────────────────

  it('القيد الثاني → JE-2024-000002', async () => {
    const tx = makeTx(2);
    const result = await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(result).toBe('JE-2024-000002');
  });

  // ── 3. New year resets counter ────────────────────────────────────────────

  it('عام جديد → يبدأ العداد من JE-2025-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextJournalNumber('agency-1', 2025, tx as never);
    expect(result).toBe('JE-2025-000001');
  });

  // ── 4. Counter with existing value 99 → JE-2024-000100 ───────────────────

  it('عداد موجود بقيمة 99 → القادم JE-2024-000100', async () => {
    const tx = makeTx(100);
    const result = await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(result).toBe('JE-2024-000100');
  });

  // ── 5. Counter value 9999 → JE-2024-009999 (no padding limit) ─────────────

  it('قيمة عداد 9999 → JE-2024-009999', async () => {
    const tx = makeTx(9999);
    const result = await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(result).toBe('JE-2024-009999');
  });

  it('قيمة عداد 10000 → JE-2024-010000 (بدون حد للأصفار)', async () => {
    const tx = makeTx(10000);
    const result = await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(result).toBe('JE-2024-010000');
  });

  // ── 6. Different agencyIds → independent counters ─────────────────────────

  it('وكالتان مختلفتان → عدادات مستقلة', async () => {
    const tx1 = makeTx(1);
    const tx2 = makeTx(1);
    const r1 = await getNextJournalNumber('agency-A', 2024, tx1 as never);
    const r2 = await getNextJournalNumber('agency-B', 2024, tx2 as never);
    expect(r1).toBe('JE-2024-000001');
    expect(r2).toBe('JE-2024-000001');
    // Verify different agency IDs were used in the insert calls
    expect(tx1.insert).toHaveBeenCalled();
    expect(tx2.insert).toHaveBeenCalled();
    expect(tx1._chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ agencyId: 'agency-A' })
    );
    expect(tx2._chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ agencyId: 'agency-B' })
    );
  });

  // ── 7. Uses yearly counter key format: "journal-2024" ─────────────────────

  it('يستخدم مفتاح العداد السنوي "journal-2024"', async () => {
    const tx = makeTx(5);
    await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(tx._chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ counterType: 'journal-2024' })
    );
  });

  // ── 8. Format: prefix-year-paddedNumber ───────────────────────────────────

  it('الصيغة: JE-{year}-{رقم مع 6 أصفار}', async () => {
    const tx = makeTx(42);
    const result = await getNextJournalNumber('agency-1', 2024, tx as never);
    expect(result).toMatch(/^JE-2024-\d{6}$/);
    expect(result).toBe('JE-2024-000042');
  });
});

// ─── getNextInvoiceNumber ─────────────────────────────────────────────────────

describe('getNextInvoiceNumber', () => {

  it('taxInvoice → INV-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextInvoiceNumber('agency-1', 'taxInvoice', 2024, tx as never);
    expect(result).toBe('INV-2024-000001');
  });

  it('commercialInvoice → CINV-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextInvoiceNumber('agency-1', 'commercialInvoice', 2024, tx as never);
    expect(result).toBe('CINV-2024-000001');
  });

  it('creditNote → CN-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextInvoiceNumber('agency-1', 'creditNote', 2024, tx as never);
    expect(result).toBe('CN-2024-000001');
  });

  it('debitNote → DN-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextInvoiceNumber('agency-1', 'debitNote', 2024, tx as never);
    expect(result).toBe('DN-2024-000001');
  });
});

// ─── getNextReceiptNumber ─────────────────────────────────────────────────────

describe('getNextReceiptNumber', () => {

  it('يُولّد رقم إيصال بتنسيق RCT-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextReceiptNumber('agency-1', 2024, tx as never);
    expect(result).toBe('RCT-2024-000001');
  });

  it('يستخدم نوع العداد "receipt-2024"', async () => {
    const tx = makeTx(1);
    await getNextReceiptNumber('agency-1', 2024, tx as never);
    expect(tx._chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ counterType: 'receipt-2024' })
    );
  });
});

// ─── getNextPaymentVoucherNumber ──────────────────────────────────────────────

describe('getNextPaymentVoucherNumber', () => {

  it('يُولّد رقم سند صرف بتنسيق PV-2024-000001', async () => {
    const tx = makeTx(1);
    const result = await getNextPaymentVoucherNumber('agency-1', 2024, tx as never);
    expect(result).toBe('PV-2024-000001');
  });
});

// ─── getNextBookingNumber ─────────────────────────────────────────────────────

describe('getNextBookingNumber', () => {

  it('يُولّد رقم حجز بتنسيق BK-24-000001 (آخر رقمين من السنة)', async () => {
    const tx = makeTx(1);
    const result = await getNextBookingNumber('agency-1', 2024, tx as never);
    expect(result).toBe('BK-24-000001');
  });

  it('يستخدم آخر رقمين من السنة فقط', async () => {
    const tx = makeTx(1);
    const result = await getNextBookingNumber('agency-1', 2025, tx as never);
    expect(result).toBe('BK-25-000001');
  });
});
