import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    ensureAdminApp();

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });

    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token);

    const agencyId = decoded['agencyId'] as string | undefined;
    if (!agencyId) {
      // User authenticated but not yet assigned to an agency — normal during onboarding
      return NextResponse.json({ synced: false, reason: 'no_agency' });
    }

    const uid   = decoded.uid;
    const email = decoded.email ?? '';
    const role  = (decoded['role'] as string) ?? 'staff';
    const nameAr = (decoded['name_ar'] as string) ?? decoded.name ?? email;
    const nameEn = decoded.name ?? nameAr;

    // Upsert: insert if new, update display name + role on re-login
    await db
      .insert(users)
      .values({ id: uid, agencyId, email, nameAr, nameEn, role, isActive: true })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          nameAr,
          nameEn,
          role,
          updatedAt: new Date(),
        },
      });

    const [row] = await db.select().from(users).where(eq(users.id, uid));

    return NextResponse.json({ synced: true, user: row });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف';
    console.error(JSON.stringify({ event: 'auth_sync_failed', error: message }));
    return NextResponse.json({ error: 'فشل مزامنة المستخدم' }, { status: 500 });
  }
}
