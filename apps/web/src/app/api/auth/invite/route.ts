import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users } from '@/lib/schema';
import { eq, count } from 'drizzle-orm';

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME  = 100;
const MAX_EMAIL = 254;

type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

interface InviteUserRequest {
  email:   string;
  nameAr:  string;
  nameEn?: string;
  mobile?: string;
  role:    UserRole;
}

export async function POST(request: Request) {
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
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'فقط مدير الوكالة يمكنه دعوة مستخدمين' }, { status: 403 });
    }

    // Check plan limits
    const [agency] = await db.select({ plan: agencies.plan }).from(agencies).where(eq(agencies.id, callerAgency));
    const agencyPlan = agency?.plan ?? 'trial';
    const userLimit  = agencyPlan === 'professional' ? Infinity : 3;

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.agencyId, callerAgency));

    if ((total ?? 0) >= userLimit) {
      return NextResponse.json({
        error: `وصلت للحد الأقصى (${userLimit} مستخدمين) في باقتك الحالية. يرجى ترقية الباقة للمتابعة.`,
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

    const setupLink = await auth.generatePasswordResetLink(email);

    await db.insert(users).values({
      id:        userRecord.uid,
      agencyId:  callerAgency,
      email,
      nameAr:    nameAr.trim(),
      nameEn:    nameEn?.trim() || nameAr.trim(),
      role:      dbRole,
      isActive:  true,
      invitedBy: callerUid,
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
