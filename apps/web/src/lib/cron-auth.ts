import { NextResponse } from 'next/server';

/**
 * Authentication gate for cron/job routes (Authorization: Bearer ${CRON_SECRET}).
 *
 * Fail-closed in every environment: a missing CRON_SECRET, a missing
 * Authorization header, or a token mismatch always yields 401 — there is no
 * development bypass. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
 * automatically once the env var is set on the project; for local runs export
 * CRON_SECRET and pass the header explicitly.
 *
 * Returns a 401 NextResponse when unauthorized, or null when the caller may proceed.
 */
export async function requireCronAuth(request: Request, route: string): Promise<NextResponse | null> {
  const secret = process.env['CRON_SECRET'];
  if (!secret) {
    console.error(JSON.stringify({ event: 'cron_misconfigured', route, reason: 'CRON_SECRET not set' }));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const presented = request.headers.get('authorization') ?? '';
  if (!(await tokensMatch(presented, `Bearer ${secret}`))) {
    console.error(JSON.stringify({ event: 'cron_auth_failed', route }));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Constant-time-equivalent comparison: both values are SHA-256 hashed first, so
 * the byte-wise comparison's timing reveals nothing about the secret. Uses the
 * Web Crypto API to stay portable across the Node.js and Edge runtimes.
 */
async function tokensMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= (ua[i]! ^ ub[i]!);
  return diff === 0;
}
