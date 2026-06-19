import { ensureAdminApp } from './firebase-admin';
import { setTenantContext } from './tenant-context';

export interface AuthClaims {
  uid: string;
  agencyId: string;
  role: string;
}

export class ApiAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

/** Business rule violation — returns 4xx to the client, never logged as a server error. */
export class BusinessError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'BusinessError';
  }
}

/** Standard catch block for all API routes. */
export function handleApiError(err: unknown, event: string): Response {
  if (err instanceof ApiAuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (err instanceof BusinessError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.error(JSON.stringify({ event, error: String(err) }));
  return new Response(JSON.stringify({ error: 'خطأ في الخادم' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Read super-admin email from env only — no hardcoded fallback.
// Set SUPER_ADMIN_EMAIL in your environment; leave it unset on purpose if
// you don't want a super-admin bypass (e.g., per-tenant deployments).
function getSuperAdminEmail(): string | undefined {
  return process.env['SUPER_ADMIN_EMAIL'] ?? undefined;
}

export async function verifyAuth(request: Request): Promise<AuthClaims> {
  ensureAdminApp();
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new ApiAuthError('يجب تسجيل الدخول أولاً', 401);

  const { getAuth } = await import('firebase-admin/auth');
  let decoded: Awaited<ReturnType<ReturnType<typeof getAuth>['verifyIdToken']>>;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    throw new ApiAuthError('رمز المصادقة غير صالح أو منتهي الصلاحية', 401);
  }
  const agencyId = decoded['agencyId'] as string | undefined;

  const superAdminEmail = getSuperAdminEmail();
  const isSuperAdmin = !!superAdminEmail && decoded.email === superAdminEmail;
  if (!agencyId && !isSuperAdmin) throw new ApiAuthError('يجب تسجيل الدخول أولاً', 401);

  // Block suspended / expired / deactivated agencies from all API access.
  // Super-admin is exempt. We distinguish two failure modes:
  //   • The lookup SUCCEEDS but the row is missing or inactive/suspended/expired
  //     → FAIL CLOSED (the agency was deleted/disabled; deny access).
  //   • The lookup itself THROWS (DB unreachable, import failure)
  //     → FAIL OPEN, but log a degraded-path alert, so a transient infra blip
  //       cannot lock every tenant out of the system.
  if (agencyId && !isSuperAdmin) {
    let ag: { isActive: boolean | null; subscriptionStatus: string | null } | undefined;
    let lookupSucceeded = false;
    try {
      const { db } = await import('./db');
      const { agencies } = await import('./schema');
      const { eq } = await import('drizzle-orm');
      [ag] = await db
        .select({ isActive: agencies.isActive, subscriptionStatus: agencies.subscriptionStatus })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1);
      lookupSucceeded = true;
    } catch (err) {
      // Infrastructure error — fail open, but surface it so the swallow path is
      // observable rather than silent.
      console.error(JSON.stringify({ event: 'agency_status_check_degraded', agencyId, error: String(err) }));
    }
    if (lookupSucceeded) {
      if (!ag) {
        throw new ApiAuthError('حساب الوكالة غير موجود — يرجى التواصل مع الدعم', 403);
      }
      if (ag.isActive === false || ag.subscriptionStatus === 'suspended' || ag.subscriptionStatus === 'expired') {
        throw new ApiAuthError('حساب الوكالة موقوف أو انتهى اشتراكه — يرجى التواصل مع الدعم', 403);
      }
    }
  }

  // Bind the tenant context for the rest of this request so db.transaction()
  // can activate RLS isolation. Super-admins (no agencyId) are left unbound →
  // RLS stays fail-open, preserving their cross-agency access.
  if (agencyId) setTenantContext(agencyId);

  return {
    uid:     decoded.uid,
    agencyId: agencyId ?? '',
    role:    (decoded['role'] as string) ?? (isSuperAdmin ? 'owner' : 'agent'),
  };
}

/**
 * Throws 403 if the authenticated user's role is not in the `allowed` set.
 *
 * Role hierarchy (most → least privileged):
 *   owner → admin → manager → accountant → staff → viewer → agent
 *
 * Usage:
 *   const { role, agencyId } = await verifyAuth(request);
 *   assertRole(role, ['admin', 'owner', 'manager']);
 */
export function assertRole(role: string, allowed: string[]): void {
  if (!allowed.includes(role)) {
    throw new ApiAuthError('ليس لديك صلاحية لهذه العملية', 403);
  }
}

// Pre-defined role sets for common permission levels
export const ROLES_ADMIN_ONLY    = ['owner', 'admin'] as const;
export const ROLES_MANAGER_UP    = ['owner', 'admin', 'manager'] as const;
export const ROLES_ACCOUNTANT_UP = ['owner', 'admin', 'manager', 'accountant'] as const;
export const ROLES_STAFF_UP      = ['owner', 'admin', 'manager', 'accountant', 'staff'] as const;
// Anyone who can create operational records (bookings). Agents are the least
// privileged role that still performs data-entry, so this set includes all roles
// above viewer plus the agent role itself.
export const ROLES_AGENT_UP      = ['owner', 'admin', 'manager', 'accountant', 'staff', 'agent'] as const;
