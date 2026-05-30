/**
 * GET /api/travel/providers
 *
 * Returns the static list of supported GDS/hotel providers with their
 * required credential fields. Secret fields are flagged so the frontend
 * can render them as password inputs.
 *
 * No DB read — the list is derived from the @masarat/travel-providers package.
 */
import { NextResponse } from 'next/server';
import { SUPPORTED_PROVIDERS } from '@masarat/travel-providers';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    const rl = await checkRateLimit(getClientIp(request), 'api');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'طلبات كثيرة جداً، حاول لاحقاً' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    await verifyAuth(request);

    return NextResponse.json({ providers: SUPPORTED_PROVIDERS });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
