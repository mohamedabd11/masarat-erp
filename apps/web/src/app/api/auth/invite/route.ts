import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users } from '@/lib/schema';
import { eq, count } from 'drizzle-orm';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sanitizePermissions, presetFeatures } from '@/lib/user-permissions';

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME  = 100;
const MAX_EMAIL = 254;
type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

interface InviteUserRequest {
  email:        string;
  nameAr:       string;
  nameEn?:      string;
  mobile?:      string;
  role:         UserRole;
  permissions?: string[];   // section-level grants (ignored for admin = full access)
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, 'invite');
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let firebaseUid: string | null = null;

  try {
    ensureAdminApp();

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const { getAuth } = await import('firebase-admin/auth');
    const auth = getAuth();

    const decoded      = await auth.verifyIdToken(token);
    const callerAgency = decoded['agencyId'] as string | undefined;
    const callerRole   = decoded['role']     as string | undefined;
    const callerUid    = decoded.uid;

    if (!callerAgency) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }
    // Only owner/admin may invite. (Non-admins are blocked here, so a lower role
    // can never escalate a new user above its own tier.)
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return NextResponse.json({ error: 'فقط مدير الوكالة يمكنه دعوة مستخدمين' }, { status: 403 });
    }

    // Check user seat limit (maxUsers from agencies table)
    const [agency] = await db
      .select({ maxUsers: agencies.maxUsers })
      .from(agencies)
      .where(eq(agencies.id, callerAgency));

    const maxUsers = agency?.maxUsers ?? 5;

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.agencyId, callerAgency));

    if ((total ?? 0) >= maxUsers) {
      return NextResponse.json({
        error: `وصلت للحد الأقصى المسموح به (${maxUsers} مستخدمين). تواصل مع إدارة النظام لزيادة الحد.`,
      }, { status: 403 });
    }

    const body  = await request.json() as InviteUserRequest;
    const { nameAr, nameEn, mobile, role } = body;
    const email = body.email?.trim().toLowerCase();

    const VALID_ROLES: UserRole[] = ['admin', 'agent', 'accountant', 'viewer'];
    if (!email || !EMAIL_RE.test(email) || email.length > MAX_EMAIL)
      return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    if (!nameAr?.trim())
      return NextResponse.json({ error: 'اسم المستخدم مطلوب' }, { status: 400 });
    if (nameAr.trim().length > MAX_NAME)
      return NextResponse.json({ error: `الاسم يجب أن لا يتجاوز ${MAX_NAME} حرفاً` }, { status: 400 });
    if (!VALID_ROLES.includes(role))
      return NextResponse.json({ error: 'الدور المحدد غير صالح' }, { status: 400 });

    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً في النظام' }, { status: 409 });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }

    const userRecord = await auth.createUser({
      email,
      displayName: nameAr.trim(),
      emailVerified: false,
    });
    firebaseUid = userRecord.uid;

    // Map extended roles to db role (admin|staff)
    const dbRole = role === 'admin' ? 'admin' : 'staff';
    await auth.setCustomUserClaims(userRecord.uid, { agencyId: callerAgency, role });

    // Section-level permissions. Admins get full access (null). For other roles,
    // use the admin's explicit selection, falling back to the role preset.
    const permissions = role === 'admin'
      ? null
      : JSON.stringify(
          body.permissions !== undefined
            ? sanitizePermissions(body.permissions)
            : presetFeatures(role),
        );

    const setupLink = await auth.generatePasswordResetLink(email);

    await db.insert(users).values({
      id:          userRecord.uid,
      agencyId:    callerAgency,
      email,
      nameAr:      nameAr.trim(),
      nameEn:      nameEn?.trim() || nameAr.trim(),
      role:        dbRole,
      permissions,
      isActive:    true,
      invitedBy:   callerUid,
    });

    return NextResponse.json({ userId: userRecord.uid, setupLink });
  } catch (err: unknown) {
    if (firebaseUid) {
      const { getAuth } = await import('firebase-admin/auth');
      await getAuth().deleteUser(firebaseUid).catch(() => {});
    }
    console.error(JSON.stringify({ event: 'auth_invite_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
