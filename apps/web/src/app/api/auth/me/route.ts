/**
 * GET /api/auth/me
 *
 * يتحقق من وجود المستخدم في PostgreSQL بعد المصادقة عبر Firebase.
 * يكشف حالة "المستخدم المعلق": نجح إنشاؤه في Firebase لكن فشل في PostgreSQL.
 *
 * يُستدعى من الـ client عند أول تحميل بعد تسجيل الدخول.
 * الاستجابات:
 *   200 — المستخدم موجود وسليم
 *   403 — المستخدم موقوف
 *   409 — Firebase UID موجود لكن لا سجل في PostgreSQL (حالة rollback فاشل)
 *   401 — توكن غير صالح
 */

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { users } from '@masarat/database/schema';
import { getHttpClient } from '@/lib/db/client';
import { extractBearerToken, verifyToken, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const { ensureAdminApp } = await import('@/lib/firebase-admin');
    ensureAdminApp();

    const token = extractBearerToken(request);
    const auth = await verifyToken(token);

    const db = getHttpClient();
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        nameAr: users.nameAr,
        nameEn: users.nameEn,
        role: users.role,
        isActive: users.isActive,
        agencyId: users.agencyId,
      })
      .from(users)
      .where(
        and(
          eq(users.firebaseUid, auth.uid),
          eq(users.agencyId, auth.agencyId)
        )
      )
      .limit(1);

    if (!user) {
      // Firebase authentication succeeded but no matching PostgreSQL record.
      // This means registration partially failed (Firebase created but DB rollback happened).
      // The admin must investigate and either re-register or manually sync the user.
      return NextResponse.json(
        {
          error: 'USER_NOT_SYNCED',
          message: 'حساب المستخدم غير مكتمل في النظام. يرجى التواصل مع الدعم الفني.',
        },
        { status: 409 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        {
          error: 'USER_INACTIVE',
          message: 'الحساب موقوف. يرجى التواصل مع مدير النظام.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        nameAr: user.nameAr,
        nameEn: user.nameEn,
        role: user.role,
        agencyId: user.agencyId,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error('[auth/me]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
