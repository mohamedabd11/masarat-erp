import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies } from '@/lib/schema';
import { TRIAL_DAYS, SUBSCRIPTION_MONTHLY_DAYS, SUBSCRIPTION_YEARLY_DAYS } from '@masarat/accounting';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'] ?? 'mohamedabdalazim1111@gmail.com';

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

    const [agency] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) {
      return NextResponse.json({ error: `الوكالة ${agencyId} غير موجودة` }, { status: 404 });
    }

    const now = new Date();

    let update: Partial<typeof agencies.$inferInsert>;
    let message: string;

    switch (action) {
      case 'activate_month':
        update  = {
          subscriptionStatus:  'active',
          plan:                'starter',
          subscriptionEndDate: new Date(Date.now() + SUBSCRIPTION_MONTHLY_DAYS * 24 * 3600 * 1000),
          updatedAt:           now,
        };
        message = 'تم تفعيل الاشتراك لمدة شهر';
        break;

      case 'activate_year':
        update  = {
          subscriptionStatus:  'active',
          plan:                'professional',
          subscriptionEndDate: new Date(Date.now() + SUBSCRIPTION_YEARLY_DAYS * 24 * 3600 * 1000),
          updatedAt:           now,
        };
        message = 'تم تفعيل الاشتراك لمدة سنة';
        break;

      case 'activate_lifetime':
        update  = {
          subscriptionStatus:  'lifetime',
          plan:                'lifetime',
          subscriptionEndDate: null,
          trialEndDate:        null,
          updatedAt:           now,
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
          trialEndDate: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000),
          updatedAt:    now,
        };
        message = 'تم تمديد الفترة التجريبية 14 يوماً';
        break;

      default:
        return NextResponse.json({ error: `إجراء غير معروف: ${action}` }, { status: 400 });
    }

    await db.update(agencies).set(update).where(eq(agencies.id, agencyId));

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
