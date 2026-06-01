import { NextResponse } from 'next/server';
import { eq, count } from 'drizzle-orm';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users, providerCredentials } from '@/lib/schema';

async function verifySuperAdmin(request: Request) {
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (!superAdminEmail) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== superAdminEmail) throw new Error('FORBIDDEN');
  return decoded;
}

export async function GET(request: Request) {
  try {
    ensureAdminApp();
    await verifySuperAdmin(request);

    const allAgencies = await db.select().from(agencies).orderBy(agencies.createdAt);

    const result = await Promise.all(
      allAgencies.map(async (a) => {
        const [[{ total: userCount }], [{ total: providerCount }]] = await Promise.all([
          db.select({ total: count() }).from(users).where(eq(users.agencyId, a.id)),
          db.select({ total: count() }).from(providerCredentials).where(eq(providerCredentials.agencyId, a.id)).catch(() => [{ total: 0 }]),
        ]);

        return {
          id:                   a.id,
          nameAr:               a.nameAr,
          nameEn:               a.nameEn ?? '',
          contactEmail:         a.email ?? a.contactEmail ?? '',
          subscriptionStatus:   a.subscriptionStatus,
          plan:                 a.plan,
          trialEndDate:         a.trialEndDate?.toISOString()          ?? null,
          subscriptionEndDate:  a.subscriptionEndDate?.toISOString()   ?? null,
          trialStartsAt:        a.trialStartsAt?.toISOString()         ?? null,
          subscriptionStartsAt: a.subscriptionStartsAt?.toISOString()  ?? null,
          createdAt:            a.createdAt?.toISOString()             ?? null,
          isActive:             a.isActive,
          maxUsers:             a.maxUsers ?? 5,
          userCount:            userCount  ?? 0,
          providerCount:        providerCount ?? 0,
          isVatRegistered:      a.isVatRegistered,
          isLifetime:           a.subscriptionStatus === 'lifetime',
        };
      }),
    );

    return NextResponse.json({ agencies: result });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error(JSON.stringify({ event: 'admin_agencies_failed', error: msg }));
    return NextResponse.json({ error: 'خطأ في تحميل البيانات' }, { status: 500 });
  }
}
