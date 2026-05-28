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

const SUPER_ADMIN_EMAIL = 'mohamedabdalazim1111@gmail.com';

export async function verifyAuth(request: Request): Promise<AuthClaims> {
  ensureAdminApp();
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new ApiAuthError('يجب تسجيل الدخول أولاً', 401);

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  const agencyId = decoded['agencyId'] as string | undefined;

  // Super admin is allowed through even without an agencyId claim.
  // Their queries will return empty results (agencyId = '') which is correct.
  const isSuperAdmin = decoded.email === SUPER_ADMIN_EMAIL;
  if (!agencyId && !isSuperAdmin) throw new ApiAuthError('يجب تسجيل الدخول أولاً', 401);

  return {
    uid: decoded.uid,
    agencyId: agencyId ?? '',
    role: (decoded['role'] as string) ?? (isSuperAdmin ? 'owner' : 'agent'),
  };
}
