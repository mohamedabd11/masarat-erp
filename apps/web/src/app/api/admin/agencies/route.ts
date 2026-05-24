import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'] ?? 'mohamedabdalazim1111@gmail.com';

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

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const snap = await db.collection('agencies').orderBy('createdAt', 'desc').get();

    const agencies = await Promise.all(
      snap.docs.map(async d => {
        const data = d.data();
        const usersSnap = await db
          .collection('users')
          .where('agencyId', '==', d.id)
          .count()
          .get();

        return {
          id:                  d.id,
          nameAr:              data['nameAr']             ?? '',
          nameEn:              data['nameEn']             ?? '',
          contactEmail:        data['contactEmail']       ?? '',
          subscriptionStatus:  data['subscriptionStatus'] ?? 'trial',
          plan:                data['plan']               ?? 'trial',
          trialEndDate:        data['trialEndDate']?.toDate?.()?.toISOString()        ?? null,
          subscriptionEndDate: data['subscriptionEndDate']?.toDate?.()?.toISOString() ?? null,
          createdAt:           data['createdAt']?.toDate?.()?.toISOString()           ?? null,
          isActive:            data['isActive'] ?? true,
          userCount:           usersSnap.data().count,
        };
      })
    );

    return NextResponse.json({ agencies });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? 'unknown';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error('[admin/agencies]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
