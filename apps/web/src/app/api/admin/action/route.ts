import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

type AdminAction = 'activate_month' | 'activate_year' | 'activate_lifetime' | 'suspend' | 'extend_trial';

function adminSql() {
  const url = process.env['ADMIN_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

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

export async function POST(request: Request) {
  try {
    const { ensureAdminApp } = await import('@/lib/firebase-admin');
    ensureAdminApp();
    await verifySuperAdmin(request);

    const body = await request.json() as { agencyId: string; action: AdminAction };
    const { agencyId, action } = body;

    if (!agencyId || !action) {
      return NextResponse.json({ error: 'agencyId و action مطلوبان' }, { status: 400 });
    }

    const db = adminSql();

    const [agency] = await db`SELECT id FROM agencies WHERE id = ${agencyId}::uuid`;
    if (!agency) {
      return NextResponse.json({ error: `الوكالة ${agencyId} غير موجودة` }, { status: 404 });
    }

    const now = new Date();
    let message: string;

    switch (action) {
      case 'activate_month': {
        const endsAt = new Date(now.getTime() + 30 * 24 * 3600_000);
        await db`
          UPDATE agencies
          SET subscription_status  = 'active',
              subscription_plan    = 'starter',
              subscription_ends_at = ${endsAt.toISOString()},
              updated_at           = NOW()
          WHERE id = ${agencyId}::uuid
        `;
        message = 'تم تفعيل الاشتراك لمدة شهر';
        break;
      }

      case 'activate_year': {
        const endsAt = new Date(now.getTime() + 365 * 24 * 3600_000);
        await db`
          UPDATE agencies
          SET subscription_status  = 'active',
              subscription_plan    = 'professional',
              subscription_ends_at = ${endsAt.toISOString()},
              updated_at           = NOW()
          WHERE id = ${agencyId}::uuid
        `;
        message = 'تم تفعيل الاشتراك لمدة سنة';
        break;
      }

      case 'activate_lifetime': {
        // No 'lifetime' status in enum — encode as active + far-future expiry
        await db`
          UPDATE agencies
          SET subscription_status  = 'active',
              subscription_plan    = 'enterprise',
              subscription_ends_at = '2099-12-31 23:59:59+00',
              trial_ends_at        = NULL,
              updated_at           = NOW()
          WHERE id = ${agencyId}::uuid
        `;
        message = 'تم تفعيل الاشتراك الدائم';
        break;
      }

      case 'suspend': {
        await db`
          UPDATE agencies
          SET subscription_status = 'suspended',
              updated_at          = NOW()
          WHERE id = ${agencyId}::uuid
        `;
        message = 'تم إيقاف الوكالة';
        break;
      }

      case 'extend_trial': {
        const trialEndsAt = new Date(now.getTime() + 14 * 24 * 3600_000);
        await db`
          UPDATE agencies
          SET subscription_status = 'trial',
              trial_ends_at       = ${trialEndsAt.toISOString()},
              updated_at          = NOW()
          WHERE id = ${agencyId}::uuid
        `;
        message = 'تم تمديد الفترة التجريبية 14 يوماً';
        break;
      }

      default:
        return NextResponse.json({ error: `إجراء غير معروف: ${action}` }, { status: 400 });
    }

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
