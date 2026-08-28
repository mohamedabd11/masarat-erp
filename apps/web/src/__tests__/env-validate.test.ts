import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '@/lib/env-validate';

const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'ENCRYPTION_KEY',
  'SUPER_ADMIN_EMAIL',
] as const;

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of REQUIRED_ENV_KEYS) vi.stubEnv(key, '');
  vi.stubEnv('VERCEL_ENV', '');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('validateEnv', () => {
  it('allows a Vercel preview to start without production secrets', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    expect(() => validateEnv()).not.toThrow();
  });

  it('still requires secrets for a Vercel production deployment', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it('still requires secrets for a local production-mode server', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it('allows development without production secrets', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(() => validateEnv()).not.toThrow();
  });
});
