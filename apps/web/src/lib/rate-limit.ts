/**
 * Rate Limiting — In-Memory للتطوير، Redis للإنتاج
 *
 * يحمي API Routes من:
 * - Brute force attacks
 * - DoS attacks
 * - API abuse
 * - Excessive billing
 *
 * استراتيجية: Sliding Window Counter
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// ─── In-Memory Store (للتطوير فقط) ───────────────────────────────────────────

const memoryStore = new Map<string, WindowEntry>();

// Warn once at startup if no distributed store is configured. The in-memory
// fallback is per-instance and resets on cold start, so it is NOT an effective
// rate limit in serverless/multi-instance deployments.
if (!process.env['UPSTASH_REDIS_REST_URL']) {
  console.warn(JSON.stringify({
    event: 'rate_limit_degraded',
    reason: 'UPSTASH_REDIS_REST_URL not set — using in-memory fallback (not effective in serverless)',
  }));
}

// تنظيف دوري كل دقيقة
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) memoryStore.delete(key);
    }
  }, 60_000);
}

// ─── Rate Limit Configs ───────────────────────────────────────────────────────

export const RATE_LIMITS = {
  // عمليات مالية: محدودة جداً لمنع الإساءة
  financial: { limit: 20, windowMs: 60_000 },       // 20 طلب/دقيقة
  // تسجيل الوكالات: محدود جداً
  register: { limit: 5, windowMs: 60 * 60_000 },    // 5 طلبات/ساعة
  // دعوة المستخدمين
  invite: { limit: 10, windowMs: 60 * 60_000 },     // 10 طلبات/ساعة
  // API عامة
  api: { limit: 100, windowMs: 60_000 },             // 100 طلب/دقيقة
  // تسجيل الدخول
  auth: { limit: 10, windowMs: 15 * 60_000 },       // 10 محاولات/15 دقيقة
} as const;

type RateLimitType = keyof typeof RATE_LIMITS;

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * التحقق من Rate Limit لعنوان IP أو identifier
 *
 * @param identifier - عنوان IP أو agencyId أو userId
 * @param type - نوع العملية
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = 'api'
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[type];

  // في الإنتاج: استخدم Upstash Redis
  if (process.env['UPSTASH_REDIS_REST_URL'] && process.env['UPSTASH_REDIS_REST_TOKEN']) {
    return checkRedisRateLimit(identifier, type, config);
  }

  // Fail closed in production: the in-memory fallback resets on every serverless
  // cold start, so it provides NO real protection against brute-force on auth /
  // register / financial routes. Requiring a distributed store mirrors how
  // CRON_SECRET and ENCRYPTION_KEY fail closed. Evaluated per-call (not at module
  // load) so `next build` — which runs with NODE_ENV=production — is unaffected.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'UPSTASH_REDIS_REST_URL/TOKEN are required in production — the in-memory rate limiter is ineffective in serverless and must not be used',
    );
  }

  // In-memory (development only)
  return checkMemoryRateLimit(identifier, type, config);
}

function checkMemoryRateLimit(
  identifier: string,
  type: RateLimitType,
  config: { limit: number; windowMs: number }
): RateLimitResult {
  const key = `rate_limit:${type}:${identifier}`;
  const now = Date.now();

  let entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs };
    memoryStore.set(key, entry);
  }

  entry.count++;

  return {
    success: entry.count <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    resetAt: new Date(entry.resetAt),
  };
}

async function checkRedisRateLimit(
  identifier: string,
  type: RateLimitType,
  config: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const key = `rate_limit:${type}:${identifier}`;
  const url = process.env['UPSTASH_REDIS_REST_URL']!;
  const token = process.env['UPSTASH_REDIS_REST_TOKEN']!;

  const windowSeconds = Math.floor(config.windowMs / 1000);

  // Atomic increment + TTL
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, windowSeconds, 'NX'],
      ['TTL', key],
    ]),
  });

  const [incrResult, , ttlResult] = await response.json() as [
    { result: number },
    unknown,
    { result: number }
  ];

  const count = incrResult.result;
  const ttl = ttlResult.result;

  return {
    success: count <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - count),
    resetAt: new Date(Date.now() + ttl * 1000),
  };
}

/**
 * Helper لـ API Routes
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.resetAt.toISOString(),
  };
}

/**
 * استخراج IP من Request headers
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}
