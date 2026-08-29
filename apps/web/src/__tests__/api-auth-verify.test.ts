import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifyIdToken,
  mockSelect,
  mockSetTenantContext,
  selectOutcomes,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockSelect: vi.fn(),
  mockSetTenantContext: vi.fn(),
  selectOutcomes: [] as Array<unknown[] | Error>,
}));

vi.mock('@/lib/firebase-admin', () => ({ ensureAdminApp: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));
vi.mock('@/lib/tenant-context', () => ({ setTenantContext: mockSetTenantContext }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));
vi.mock('@/lib/schema', () => ({
  agencies: { id: 'agencies.id', isActive: 'agencies.isActive', subscriptionStatus: 'agencies.subscriptionStatus' },
  users: { id: 'users.id', agencyId: 'users.agencyId', permissions: 'users.permissions', isActive: 'users.isActive' },
}));
vi.mock('@/lib/db', () => ({ db: { select: mockSelect } }));

import { verifyAuth } from '@/lib/api-auth';

function makeSelectChain(outcome: unknown[] | Error) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockImplementation(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return chain;
}

function request(path = '/api/bookings') {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: 'Bearer valid-token' },
  });
}

describe('verifyAuth — fail-closed account and permission checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectOutcomes.splice(0);
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user-1',
      agencyId: 'agency-1',
      role: 'agent',
      email: 'agent@example.test',
    });
    mockSelect.mockImplementation(() => makeSelectChain(selectOutcomes.shift() ?? []));
  });

  it('allows an active user with an explicit feature grant', async () => {
    selectOutcomes.push(
      [{ isActive: true, subscriptionStatus: 'trial' }],
      [{ agencyId: 'agency-1', permissions: '["bookings"]', isActive: true }],
    );

    await expect(verifyAuth(request())).resolves.toMatchObject({
      uid: 'user-1',
      agencyId: 'agency-1',
      permissions: ['bookings'],
    });
    expect(mockSetTenantContext).toHaveBeenCalledWith('agency-1');
  });

  it('blocks a valid Firebase token when the database user row is missing', async () => {
    selectOutcomes.push(
      [{ isActive: true, subscriptionStatus: 'trial' }],
      [],
    );

    await expect(verifyAuth(request())).rejects.toMatchObject({ status: 403 });
  });

  it('blocks access when the account-status lookup fails', async () => {
    selectOutcomes.push(
      new Error('database unavailable'),
      [{ agencyId: 'agency-1', permissions: '["bookings"]', isActive: true }],
    );

    await expect(verifyAuth(request())).rejects.toMatchObject({ status: 503 });
  });

  it('does not turn malformed stored permissions into full access', async () => {
    selectOutcomes.push(
      [{ isActive: true, subscriptionStatus: 'trial' }],
      [{ agencyId: 'agency-1', permissions: 'not-json', isActive: true }],
    );

    await expect(verifyAuth(request('/api/accounting/journal')))
      .rejects.toMatchObject({ status: 403 });
  });
});
