/**
 * Firebase Auth — Token Verification & Session Management
 *
 * يُستخدم في كل Server Action وAPI Route للتحقق من هوية المستخدم
 * وإرجاع claims الـ tenant بشكل آمن
 */

import { ensureAdminApp } from './firebase-admin.js';

export interface AuthContext {
  uid: string;
  agencyId: string;
  email: string;
  role: 'admin' | 'agent' | 'accountant' | 'viewer';
  permissions: Record<string, boolean>;
  subscriptionPlan: string;
  subscriptionStatus: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNAUTHENTICATED'
      | 'FORBIDDEN'
      | 'INVALID_TOKEN'
      | 'TOKEN_EXPIRED'
      | 'MISSING_AGENCY'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * التحقق من Firebase ID Token واستخراج AuthContext
 * يُرمى AuthError إذا كان التوكن غير صالح
 */
export async function verifyToken(idToken: string): Promise<AuthContext> {
  if (!idToken?.trim()) {
    throw new AuthError('Authorization token is required', 'UNAUTHENTICATED');
  }

  ensureAdminApp();

  const { getAuth } = await import('firebase-admin/auth');

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken, true); // checkRevoked=true
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'auth/id-token-expired') {
      throw new AuthError('Token has expired', 'TOKEN_EXPIRED');
    }
    if (e.code === 'auth/id-token-revoked') {
      throw new AuthError('Token has been revoked', 'INVALID_TOKEN');
    }
    throw new AuthError('Invalid token', 'INVALID_TOKEN');
  }

  const agencyId = decoded['agencyId'] as string | undefined;
  if (!agencyId) {
    throw new AuthError(
      'User is not associated with any agency. Contact support.',
      'MISSING_AGENCY'
    );
  }

  return {
    uid: decoded.uid,
    agencyId,
    email: decoded.email ?? '',
    role: (decoded['role'] as AuthContext['role']) ?? 'viewer',
    permissions: extractPermissions(decoded),
    subscriptionPlan: (decoded['subscriptionPlan'] as string) ?? 'trial',
    subscriptionStatus: (decoded['subscriptionStatus'] as string) ?? 'active',
  };
}

/**
 * استخراج الصلاحيات الخاصة من الـ claims
 */
function extractPermissions(decoded: Record<string, unknown>): Record<string, boolean> {
  const permissions: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(decoded)) {
    if (key.startsWith('perm_') && typeof value === 'boolean') {
      permissions[key] = value;
    }
  }
  return permissions;
}

/**
 * استخراج token من Authorization header
 */
export function extractBearerToken(request: Request): string {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(
      'Missing or invalid Authorization header. Expected: Bearer <token>',
      'UNAUTHENTICATED'
    );
  }
  return authHeader.slice(7).trim();
}

/**
 * RBAC Helper — التحقق من صلاحية محددة
 */
export function assertRole(
  auth: AuthContext,
  requiredRoles: AuthContext['role'][]
): void {
  if (!requiredRoles.includes(auth.role)) {
    throw new AuthError(
      `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${auth.role}`,
      'FORBIDDEN'
    );
  }
}

/**
 * RBAC Helper — التحقق من صلاحية خاصة
 */
export function assertPermission(auth: AuthContext, permission: string): void {
  if (!auth.permissions[permission]) {
    throw new AuthError(
      `Missing permission: ${permission}`,
      'FORBIDDEN'
    );
  }
}

/**
 * Super Admin verification — server-side only
 */
export function isSuperAdmin(email: string): boolean {
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (!superAdminEmail) return false;
  return email.toLowerCase() === superAdminEmail.toLowerCase();
}
