import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDatabaseUrl } from '@/lib/admin-database-url';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('DATABASE_URL', 'postgresql://restricted-runtime');
  vi.stubEnv('ADMIN_DATABASE_URL', '');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('getAdminDatabaseUrl', () => {
  it('uses the explicit privileged connection when configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_DATABASE_URL', 'postgresql://privileged-admin');

    expect(getAdminDatabaseUrl()).toBe('postgresql://privileged-admin');
  });

  it('never falls back to the runtime connection in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(getAdminDatabaseUrl()).toBeUndefined();
  });

  it('allows a local-development fallback', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(getAdminDatabaseUrl()).toBe('postgresql://restricted-runtime');
  });
});
