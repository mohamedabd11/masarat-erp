import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, rateLimitHeaders, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

// ─── RATE_LIMITS config ───────────────────────────────────────────────────────

describe('RATE_LIMITS config', () => {
  it('financial: 20 req/min', () => {
    expect(RATE_LIMITS.financial.limit).toBe(20);
    expect(RATE_LIMITS.financial.windowMs).toBe(60_000);
  });

  it('auth: 10 req per 15 min', () => {
    expect(RATE_LIMITS.auth.limit).toBe(10);
    expect(RATE_LIMITS.auth.windowMs).toBe(15 * 60_000);
  });

  it('register: 5 req/hour', () => {
    expect(RATE_LIMITS.register.limit).toBe(5);
    expect(RATE_LIMITS.register.windowMs).toBe(60 * 60_000);
  });

  it('api: 100 req/min', () => {
    expect(RATE_LIMITS.api.limit).toBe(100);
    expect(RATE_LIMITS.api.windowMs).toBe(60_000);
  });
});

// ─── checkRateLimit — in-memory ───────────────────────────────────────────────

describe('checkRateLimit (in-memory)', () => {
  // Each test uses a unique identifier to isolate window state
  let id: string;
  beforeEach(() => { id = `test-${crypto.randomUUID()}`; });

  it('first request is always successful', async () => {
    const result = await checkRateLimit(id, 'financial');
    expect(result.success).toBe(true);
    expect(result.limit).toBe(20);
    expect(result.remaining).toBe(19);
  });

  it('remaining decrements correctly', async () => {
    await checkRateLimit(id, 'financial');
    const second = await checkRateLimit(id, 'financial');
    expect(second.remaining).toBe(18);
  });

  it('returns success:false after exceeding limit', async () => {
    // 'invite' limit is 10 — exhaust it
    for (let i = 0; i < 10; i++) await checkRateLimit(id, 'invite');
    const over = await checkRateLimit(id, 'invite');
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it('remaining never goes below 0', async () => {
    for (let i = 0; i < 15; i++) await checkRateLimit(id, 'invite');
    const result = await checkRateLimit(id, 'invite');
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('resetAt is in the future', async () => {
    const result = await checkRateLimit(id, 'api');
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('different types have independent counters', async () => {
    // exhaust 'invite' for this id
    for (let i = 0; i < 10; i++) await checkRateLimit(id, 'invite');
    const over = await checkRateLimit(id, 'invite');
    expect(over.success).toBe(false);

    // 'api' limit is 100 — same id but separate bucket
    const apiResult = await checkRateLimit(id, 'api');
    expect(apiResult.success).toBe(true);
  });

  it('different identifiers have independent counters', async () => {
    const id2 = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i++) await checkRateLimit(id, 'invite');
    const a = await checkRateLimit(id, 'invite');
    const b = await checkRateLimit(id2, 'invite');
    expect(a.success).toBe(false);
    expect(b.success).toBe(true);
  });
});

// ─── rateLimitHeaders ─────────────────────────────────────────────────────────

describe('rateLimitHeaders', () => {
  const mockResult = {
    success:   true,
    limit:     20,
    remaining: 15,
    resetAt:   new Date('2025-01-01T00:01:00.000Z'),
  };

  it('includes X-RateLimit-Limit', () => {
    expect(rateLimitHeaders(mockResult)['X-RateLimit-Limit']).toBe('20');
  });

  it('includes X-RateLimit-Remaining', () => {
    expect(rateLimitHeaders(mockResult)['X-RateLimit-Remaining']).toBe('15');
  });

  it('includes X-RateLimit-Reset as ISO string', () => {
    expect(rateLimitHeaders(mockResult)['X-RateLimit-Reset']).toBe('2025-01-01T00:01:00.000Z');
  });

  it('remaining=0 when exhausted', () => {
    const exhausted = { ...mockResult, remaining: 0 };
    expect(rateLimitHeaders(exhausted)['X-RateLimit-Remaining']).toBe('0');
  });
});

// ─── getClientIp ──────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  function req(headers: Record<string, string>) {
    return new Request('http://localhost/api/test', { headers });
  }

  it('reads x-forwarded-for (single IP)', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('reads first IP from x-forwarded-for chain', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 172.16.0.1' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(req({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('falls back to 127.0.0.1 when no IP headers present', () => {
    expect(getClientIp(req({}))).toBe('127.0.0.1');
  });

  it('trims whitespace from x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '  9.9.9.9  , 1.1.1.1' }))).toBe('9.9.9.9');
  });
});
