import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';

// ─── Validation helpers ───────────────────────────────────────────────────────

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE  = /^[+\d\s\-()]{7,20}$/;
const MAX_NAME  = 100;
const MAX_EMAIL = 254;

function validateEmail(v: string): string | null {
  if (!EMAIL_RE.test(v)) return 'صيغة البريد الإلكتروني غير صحيحة';
  if (v.length > MAX_EMAIL) return 'البريد الإلكتروني طويل جداً';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

interface InviteUserRequest {
  email: string;
  nameAr: string;
  nameEn?: string;
  mobile?: string;
  role: UserRole;
}

export async function POST(request: Request) {
  try {
    ensureAdminApp();

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const auth = getAuth();
    const db   = getFirestore();

    const decoded = await auth.verifyIdToken(token);
    const callerAgencyId = decoded['agencyId'] as string | undefined;
    const callerRole     = decoded['role']     as string | undefined;
    const callerUid      = decoded.uid;

    if (!callerAgencyId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }
    if (callerRole !== 'admin') {
      return NextResponse.json({ error: 'فقط مدير الوكالة يمكنه دعوة مستخدمين' }, { status: 403 });
    }

    // التحقق من حد المستخدمين حسب الباقة
    const agencySnap = await db.collection('agencies').doc(callerAgencyId).get();
    const agencyPlan = (agencySnap.data()?.['plan'] ?? 'trial') as string;
    const userLimit  = agencyPlan === 'professional' ? Infinity : 3;

    const usersCount = await db
      .collection('users')
      .where('agencyId', '==', callerAgencyId)
      .count()
      .get();

    if (usersCount.data().count >= userLimit) {
      return NextResponse.json({
        error: `وصلت للحد الأقصى (${userLimit} مستخدمين) في باقتك الحالية. يرجى ترقية الباقة للمتابعة.`,
      }, { status: 403 });
    }

    const body = await request.json() as InviteUserRequest;
    const { nameAr, nameEn, mobile, role } = body;
    const email = body.email?.trim().toLowerCase();

    const VALID_ROLES: UserRole[] = ['admin', 'agent', 'accountant', 'viewer'];

    // ── Input validation ──────────────────────────────────────────────────────
    const emailErr = validateEmail(email ?? '');
    if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
    if (!nameAr?.trim())
      return NextResponse.json({ error: 'اسم المستخدم مطلوب' }, { status: 400 });
    if (nameAr.trim().length > MAX_NAME)
      return NextResponse.json({ error: `الاسم يجب ألا يتجاوز ${MAX_NAME} حرفاً` }, { status: 400 });
    if (!VALID_ROLES.includes(role))
      return NextResponse.json({ error: 'الدور الوظيفي غير صالح' }, { status: 400 });
    if (mobile?.trim()) {
      const phoneErr = mobile.trim().length > 20 || !/^[+\d\s\-()]{7,20}$/.test(mobile.trim());
      if (phoneErr) return NextResponse.json({ error: 'رقم الهاتف غير صالح' }, { status: 400 });
    }

    // التحقق من عدم تكرار البريد
    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً في النظام' }, { status: 409 });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }

    const now = Timestamp.now();

    const userRecord = await auth.createUser({
      email,
      displayName: nameAr.trim(),
      emailVerified: false,
      disabled: false,
    });

    await auth.setCustomUserClaims(userRecord.uid, { agencyId: callerAgencyId, role });

    const setupLink = await auth.generatePasswordResetLink(email);

    await db.collection('users').doc(userRecord.uid).set({
      agencyId:    callerAgencyId,
      name:        { ar: nameAr.trim(), en: nameEn?.trim() || nameAr.trim() },
      email,
      mobile:      mobile?.trim() ?? '',
      role,
      preferences: { language: 'ar', theme: 'light' },
      isActive:    true,
      invitedBy:   callerUid,
      createdAt:   now,
    });

    return NextResponse.json({ userId: userRecord.uid, setupLink });
  } catch (err: unknown) {
    console.error('[auth/invite]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
