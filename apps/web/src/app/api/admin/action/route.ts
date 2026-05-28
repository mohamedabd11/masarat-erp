import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'];
if (!SUPER_ADMIN_EMAIL) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

type AdminAction = 'activate_month' | 'activate_year' | 'activate_lifetime' | 'suspend' | 'extend_trial';

async function verifySuperAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== SUPER_ADMIN_EMAIL) throw new Error('FORBIDDEN');
  return decoded;
}

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    await verifySuperAdmin(request);

    const body = await request.json() as { agencyId: string; action: AdminAction };
    const { agencyId, action } = body;

    if (!agencyId || !action) {
      return NextResponse.json({ error: 'agencyId و action مطلوبان' }, { status: 400 });
    }

    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const db  = getFirestore();
    const now = Timestamp.now();
    const ref = db.collection('agencies').doc(agencyId);

    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: `الوكالة ${agencyId} غير موجودة` }, { status: 404 });
    }

    let update: Record<string, unknown>;
    let message: string;

    switch (action) {
      case 'activate_month':
        update  = {
          subscriptionStatus:  'active',
          plan:                'starter',
          subscriptionEndDate: new Timestamp(Math.floor(Date.now() / 1000) + 30 * 24 * 3600, 0),
          updatedAt: now,
        };
        message = 'تم تفعيل الاشتراك لمدة شهر';
        break;

      case 'activate_year':
        update  = {
          subscriptionStatus:  'active',
          plan:                'professional',
          subscriptionEndDate: new Timestamp(Math.floor(Date.now() / 1000) + 365 * 24 * 3600, 0),
          isLifetime:          false,
          updatedAt: now,
        };
        message = 'تم تفعيل الاشتراك لمدة سنة';
        break;

      case 'activate_lifetime':
        update  = {
          subscriptionStatus:  'lifetime',
          plan:                'lifetime',
          isLifetime:          true,
          subscriptionEndDate: null,
          trialEndDate:        null,
          updatedAt: now,
        };
        message = 'تم تفعيل الاشتراك الدائم ♾';
        break;

      case 'suspend':
        update  = { subscriptionStatus: 'past_due', updatedAt: now };
        message = 'تم إيقاف الوكالة';
        break;

      case 'extend_trial':
        update  = {
          subscriptionStatus: 'trial',
          trialEndDate: new Timestamp(Math.floor(Date.now() / 1000) + 14 * 24 * 3600, 0),
          updatedAt: now,
        };
        message = 'تم تمديد الفترة التجريبية 14 يوماً';
        break;

      default:
        return NextResponse.json({ error: `إجراء غير معروف: ${action}` }, { status: 400 });
    }

    await ref.update(update);
    return NextResponse.json({ success: true, message });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error('[admin/action]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
