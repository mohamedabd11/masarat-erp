import { NextResponse } from 'next/server';
import { eq, count } from 'drizzle-orm';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users } from '@/lib/schema';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'];
if (!SUPER_ADMIN_EMAIL) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

async function verifySuperAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== SUPER_ADMIN_EMAIL) throw new Error('FORBIDDEN');
  return decoded;
}

export async function GET(request: Request) {
  try {
    ensureAdminApp();
    await verifySuperAdmin(request);

    const allAgencies = await db.select().from(agencies);

    const result = await Promise.all(
      allAgencies.map(async (a) => {
        const [{ total }] = await db
          .select({ total: count() })
          .from(users)
          .where(eq(users.agencyId, a.id));

        return {
          id:                  a.id,
          nameAr:              a.nameAr,
          nameEn:              a.nameEn ?? '',
          contactEmail:        a.email ?? '',
          subscriptionStatus:  a.subscriptionStatus,
          plan:                a.plan,
          trialEndDate:        a.trialEndDate?.toISOString()        ?? null,
          subscriptionEndDate: a.subscriptionEndDate?.toISOString() ?? null,
          createdAt:           a.createdAt?.toISOString()           ?? null,
          isActive:            a.isActive,
          userCount:           total ?? 0,
        };
      }),
    );

    return NextResponse.json({ agencies: result });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? 'unknown';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error(JSON.stringify({ event: 'admin_agencies_failed', error: msg }));
    return NextResponse.json({ error: 'خطأ في تحميل البيانات' }, { status: 500 });
  }
}
