import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be declared before the mock factory so vi.fn() is defined at hoist time
const mockLimit = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
  },
}));

import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';

const AGENCY = 'agency-test';
const OP     = 'create_invoice';
const KEY    = 'inv-key-001';

describe('buildIdempotencyInsert', () => {
  it('builds the composite id correctly', () => {
    const insert = buildIdempotencyInsert(AGENCY, OP, KEY, { invoiceId: 'inv-1' });
    expect(insert.id).toBe(`${AGENCY}_${OP}_${KEY}`);
  });

  it('sets status to complete', () => {
    const insert = buildIdempotencyInsert(AGENCY, OP, KEY, {});
    expect(insert.status).toBe('complete');
  });

  it('stores result payload as-is', () => {
    const result = { invoiceId: 'inv-1', total: 50000 };
    const insert = buildIdempotencyInsert(AGENCY, OP, KEY, result);
    expect(insert.result).toEqual(result);
  });

  it('sets expiresAt ~24h in the future', () => {
    const before = Date.now();
    const insert = buildIdempotencyInsert(AGENCY, OP, KEY, {});
    const after  = Date.now();
    const exp    = insert.expiresAt as Date;
    const expMs  = exp.getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    expect(expMs).toBeGreaterThanOrEqual(before + oneDay - 100);
    expect(expMs).toBeLessThanOrEqual(after  + oneDay + 100);
  });
});

describe('withIdempotency', () => {
  beforeEach(() => {
    mockLimit.mockReset();
  });

  it('calls fn() when no existing key record found', async () => {
    mockLimit.mockResolvedValueOnce([]);
    const fn = vi.fn().mockResolvedValue({ invoiceId: 'new-inv' });

    const result = await withIdempotency(KEY, AGENCY, OP, fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toEqual({ invoiceId: 'new-inv' });
  });

  it('returns cached result when complete and not expired', async () => {
    const cachedResult = { invoiceId: 'cached-inv' };
    const future = new Date(Date.now() + 3600_000); // 1 hour from now
    mockLimit.mockResolvedValueOnce([{
      status: 'complete',
      result: cachedResult,
      expiresAt: future,
    }]);
    const fn = vi.fn();

    const result = await withIdempotency(KEY, AGENCY, OP, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result).toEqual(cachedResult);
  });

  it('calls fn() when existing key is expired', async () => {
    const past = new Date(Date.now() - 1000); // 1 second ago
    mockLimit.mockResolvedValueOnce([{
      status: 'complete',
      result: { invoiceId: 'old-inv' },
      expiresAt: past,
    }]);
    const fn = vi.fn().mockResolvedValue({ invoiceId: 'new-inv' });

    const result = await withIdempotency(KEY, AGENCY, OP, fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toEqual({ invoiceId: 'new-inv' });
  });

  it('calls fn() when existing key has status pending (not complete)', async () => {
    const future = new Date(Date.now() + 3600_000);
    mockLimit.mockResolvedValueOnce([{
      status: 'pending',
      result: null,
      expiresAt: future,
    }]);
    const fn = vi.fn().mockResolvedValue({ invoiceId: 'retried-inv' });

    const result = await withIdempotency(KEY, AGENCY, OP, fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toEqual({ invoiceId: 'retried-inv' });
  });

  it('calls fn() when existing key has no expiresAt', async () => {
    mockLimit.mockResolvedValueOnce([{
      status: 'complete',
      result: { invoiceId: 'x' },
      expiresAt: null,
    }]);
    const fn = vi.fn().mockResolvedValue({ invoiceId: 'fresh' });

    const result = await withIdempotency(KEY, AGENCY, OP, fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toEqual({ invoiceId: 'fresh' });
  });
});
