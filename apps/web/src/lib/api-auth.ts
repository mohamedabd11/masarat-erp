import { ensureAdminApp } from './firebase-admin';

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
  const decoded = await getAuth().verifyIdToken(token);
  const agencyId = decoded['agencyId'] as string | undefined;

  const superAdminEmail = getSuperAdminEmail();
  const isSuperAdmin = !!superAdminEmail && decoded.email === superAdminEmail;
  if (!agencyId && !isSuperAdmin) throw new ApiAuthError('يجب تسجيل الدخول أولاً', 401);

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
