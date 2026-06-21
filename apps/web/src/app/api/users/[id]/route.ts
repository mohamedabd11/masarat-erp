import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { sanitizePermissions, presetFeatures } from '@/lib/user-permissions';
import { logAudit } from '@/lib/audit';

type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';
const VALID_ROLES: UserRole[] = ['admin', 'agent', 'accountant', 'viewer'];

const SAFE_USER_COLS = {
  id:          users.id,
  agencyId:    users.agencyId,
  email:       users.email,
  nameAr:      users.nameAr,
  nameEn:      users.nameEn,
  role:        users.role,
  permissions: users.permissions,
  isActive:    users.isActive,
  updatedAt:   users.updatedAt,
} as const;

interface PatchBody {
  role?:        UserRole;
  permissions?: string[];
  isActive?:    boolean;
}

// PATCH /api/users/[id] — admin/owner edits a user's role, section permissions,
// and active state. Scoped to the caller's agency (IDOR-safe).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: targetId } = await params;
    const { agencyId, role: callerRole, uid: callerUid } = await verifyAuth(request);
    assertRole(callerRole, [...ROLES_ADMIN_ONLY]);

    // Load the target and confirm it belongs to the caller's agency.
    const [target] = await db
      .select({ id: users.id, agencyId: users.agencyId, role: users.role, permissions: users.permissions, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, targetId));
    if (!target || target.agencyId !== agencyId) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    }

    const body = await request.json() as PatchBody;

    // Guard against an admin locking themselves out of their own agency.
    if (targetId === callerUid) {
      if (body.isActive === false) {
        return NextResponse.json({ error: 'لا يمكنك تعطيل حسابك الخاص' }, { status: 400 });
      }
      if (body.role !== undefined && body.role !== 'admin') {
        return NextResponse.json({ error: 'لا يمكنك تخفيض صلاحية حسابك الخاص' }, { status: 400 });
      }
    }

    if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'الدور المحدد غير صالح' }, { status: 400 });
    }

    // Resolve the effective role to compute permissions consistently.
    const effectiveRole: UserRole =
      body.role ?? (target.role === 'admin' ? 'admin' : 'agent');

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.role !== undefined) {
      patch['role'] = body.role === 'admin' ? 'admin' : 'staff';
    }
    if (body.isActive !== undefined) {
      patch['isActive'] = body.isActive;
    }
    // Permissions: admins are always full-access (null). Otherwise persist the
    // explicit selection (or the role preset when the role changed and none given).
    if (body.permissions !== undefined || body.role !== undefined) {
      if (effectiveRole === 'admin') {
        patch['permissions'] = null;
      } else if (body.permissions !== undefined) {
        patch['permissions'] = JSON.stringify(sanitizePermissions(body.permissions));
      } else {
        patch['permissions'] = JSON.stringify(presetFeatures(effectiveRole));
      }
    }

    // If the role changed, update the Firebase custom claim so the token reflects
    // it on the user's next token refresh (permissions are read live from the DB).
    if (body.role !== undefined) {
      const { ensureAdminApp } = await import('@/lib/firebase-admin');
      ensureAdminApp();
      const { getAuth } = await import('firebase-admin/auth');
      await getAuth().setCustomUserClaims(targetId, { agencyId, role: body.role });
    }

    const [updated] = await db.update(users).set(patch).where(eq(users.id, targetId)).returning(SAFE_USER_COLS);

    void logAudit({
      agencyId, userId: callerUid, userEmail: callerUid,
      action: 'update', resource: 'user', resourceId: targetId,
      before: { role: target.role, permissions: target.permissions, isActive: target.isActive },
      after:  { role: patch['role'] ?? target.role, permissions: patch['permissions'] ?? target.permissions, isActive: patch['isActive'] ?? target.isActive },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'user_update_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
