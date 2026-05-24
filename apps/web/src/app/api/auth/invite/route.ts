import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';

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

    const body = await request.json() as InviteUserRequest;
    const { nameAr, nameEn, mobile, role } = body;
    const email = body.email?.trim().toLowerCase();

    const VALID_ROLES: UserRole[] = ['admin', 'agent', 'accountant', 'viewer'];
    if (!email || !nameAr?.trim() || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة أو غير صالحة' }, { status: 400 });
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
