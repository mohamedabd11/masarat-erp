/**
 * Tests for the cron/job route authentication gate (lib/cron-auth.ts).
 *
 * The gate must be fail-closed in every environment: missing CRON_SECRET,
 * missing Authorization header, or a token mismatch always yields 401 —
 * there is no NODE_ENV-based development bypass.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { requireCronAuth } from '@/lib/cron-auth';

const ORIGINAL_SECRET = process.env['CRON_SECRET'];

function makeRequest(auth?: string): Request {
  return new Request('http://localhost/api/jobs/test-route', {
    headers: auth !== undefined ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env['CRON_SECRET'];
});

afterAll(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL_SECRET !== undefined) process.env['CRON_SECRET'] = ORIGINAL_SECRET;
});

describe('requireCronAuth — مصادقة مسارات cron (fail closed)', () => {

  it('401 عند غياب CRON_SECRET حتى في بيئة التطوير (لا يوجد تجاوز dev)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await requireCronAuth(makeRequest('Bearer anything'), 'test-route');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('401 عند غياب CRON_SECRET في الإنتاج', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await requireCronAuth(makeRequest('Bearer anything'), 'test-route');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('401 عند غياب ترويسة Authorization رغم ضبط السر', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-token');
    const res = await requireCronAuth(makeRequest(), 'test-route');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('401 عند رمز Bearer خاطئ', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-token');
    const res = await requireCronAuth(makeRequest('Bearer wrong-token'), 'test-route');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('401 عند تطابق جزئي (بادئة صحيحة وطول مختلف)', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-token');
    const res = await requireCronAuth(makeRequest('Bearer super-secret-token-extra'), 'test-route');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('null (مسموح) عند رمز Bearer صحيح', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-token');
    const res = await requireCronAuth(makeRequest('Bearer super-secret-token'), 'test-route');
    expect(res).toBeNull();
  });

  it('null عند رمز صحيح في بيئة التطوير أيضاً (السلوك موحّد عبر البيئات)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRON_SECRET', 'super-secret-token');
    const res = await requireCronAuth(makeRequest('Bearer super-secret-token'), 'test-route');
    expect(res).toBeNull();
  });
});
