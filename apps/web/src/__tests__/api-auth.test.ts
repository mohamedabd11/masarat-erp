import { describe, it, expect } from 'vitest';
import {
  assertRole,
  ApiAuthError,
  BusinessError,
  handleApiError,
  ROLES_ADMIN_ONLY,
  ROLES_MANAGER_UP,
  ROLES_ACCOUNTANT_UP,
  ROLES_STAFF_UP,
} from '@/lib/api-auth';

// ─── assertRole ───────────────────────────────────────────────────────────────

describe('assertRole', () => {

  it('owner passes admin-only check', () => {
    expect(() => assertRole('owner', [...ROLES_ADMIN_ONLY])).not.toThrow();
  });

  it('admin passes admin-only check', () => {
    expect(() => assertRole('admin', [...ROLES_ADMIN_ONLY])).not.toThrow();
  });

  it('manager is blocked from admin-only routes', () => {
    expect(() => assertRole('manager', [...ROLES_ADMIN_ONLY])).toThrow(ApiAuthError);
  });

  it('accountant is blocked from admin-only routes', () => {
    expect(() => assertRole('accountant', [...ROLES_ADMIN_ONLY])).toThrow(ApiAuthError);
  });

  it('staff is blocked from admin-only routes', () => {
    expect(() => assertRole('staff', [...ROLES_ADMIN_ONLY])).toThrow(ApiAuthError);
  });

  it('agent is blocked from admin-only routes', () => {
    expect(() => assertRole('agent', [...ROLES_ADMIN_ONLY])).toThrow(ApiAuthError);
  });

  it('manager passes manager-up check', () => {
    expect(() => assertRole('manager', [...ROLES_MANAGER_UP])).not.toThrow();
  });

  it('accountant is blocked from manager-up routes', () => {
    expect(() => assertRole('accountant', [...ROLES_MANAGER_UP])).toThrow(ApiAuthError);
  });

  it('accountant passes accountant-up check', () => {
    expect(() => assertRole('accountant', [...ROLES_ACCOUNTANT_UP])).not.toThrow();
  });

  it('staff is blocked from accountant-up routes', () => {
    expect(() => assertRole('staff', [...ROLES_ACCOUNTANT_UP])).toThrow(ApiAuthError);
  });

  it('staff passes staff-up check', () => {
    expect(() => assertRole('staff', [...ROLES_STAFF_UP])).not.toThrow();
  });

  it('viewer is blocked from staff-up routes', () => {
    expect(() => assertRole('viewer', [...ROLES_STAFF_UP])).toThrow(ApiAuthError);
  });

  it('unknown role is always blocked', () => {
    expect(() => assertRole('superuser', [...ROLES_ADMIN_ONLY])).toThrow(ApiAuthError);
    expect(() => assertRole('', [...ROLES_STAFF_UP])).toThrow(ApiAuthError);
  });

  it('403 status is returned for unauthorized roles', () => {
    try {
      assertRole('viewer', [...ROLES_ADMIN_ONLY]);
    } catch (e) {
      expect(e).toBeInstanceOf(ApiAuthError);
      expect((e as ApiAuthError).status).toBe(403);
    }
  });
});

// ─── ApiAuthError ─────────────────────────────────────────────────────────────

describe('ApiAuthError', () => {
  it('is an instance of Error', () => {
    const err = new ApiAuthError('غير مصرح', 403);
    expect(err).toBeInstanceOf(Error);
  });

  it('stores status correctly', () => {
    expect(new ApiAuthError('غير مصرح', 403).status).toBe(403);
    expect(new ApiAuthError('يجب تسجيل الدخول', 401).status).toBe(401);
  });

  it('name is ApiAuthError', () => {
    expect(new ApiAuthError('msg', 403).name).toBe('ApiAuthError');
  });
});

// ─── BusinessError ────────────────────────────────────────────────────────────

describe('BusinessError', () => {
  it('defaults to status 400', () => {
    expect(new BusinessError('خطأ').status).toBe(400);
  });

  it('accepts custom status', () => {
    expect(new BusinessError('خطأ', 422).status).toBe(422);
  });

  it('name is BusinessError', () => {
    expect(new BusinessError('msg').name).toBe('BusinessError');
  });
});

// ─── handleApiError ───────────────────────────────────────────────────────────

describe('handleApiError', () => {
  it('maps ApiAuthError → correct HTTP status', () => {
    const res = handleApiError(new ApiAuthError('غير مصرح', 403), 'test');
    expect(res.status).toBe(403);
  });

  it('maps BusinessError → correct HTTP status', () => {
    const res = handleApiError(new BusinessError('فترة مغلقة', 422), 'test');
    expect(res.status).toBe(422);
  });

  it('maps unknown errors → 500', () => {
    const res = handleApiError(new Error('crash'), 'test');
    expect(res.status).toBe(500);
  });

  it('returns JSON body for ApiAuthError', async () => {
    const res = handleApiError(new ApiAuthError('ليس لديك صلاحية', 403), 'test');
    const body = await res.json() as { error: string };
    expect(body.error).toContain('صلاحية');
  });

  it('returns generic Arabic error message for 500', async () => {
    const res = handleApiError(new TypeError('boom'), 'test');
    const body = await res.json() as { error: string };
    expect(body.error).toContain('خطأ');
  });
});

// ─── Role constant coverage ───────────────────────────────────────────────────

describe('Role constants hierarchy', () => {
  it('ROLES_ADMIN_ONLY contains exactly owner and admin', () => {
    expect([...ROLES_ADMIN_ONLY]).toEqual(['owner', 'admin']);
  });

  it('ROLES_MANAGER_UP is a superset of ROLES_ADMIN_ONLY', () => {
    for (const r of ROLES_ADMIN_ONLY) {
      expect(ROLES_MANAGER_UP).toContain(r);
    }
  });

  it('ROLES_ACCOUNTANT_UP is a superset of ROLES_MANAGER_UP', () => {
    for (const r of ROLES_MANAGER_UP) {
      expect(ROLES_ACCOUNTANT_UP).toContain(r);
    }
  });

  it('ROLES_STAFF_UP is a superset of ROLES_ACCOUNTANT_UP', () => {
    for (const r of ROLES_ACCOUNTANT_UP) {
      expect(ROLES_STAFF_UP).toContain(r);
    }
  });
});
