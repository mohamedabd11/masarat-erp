import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

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

export async function GET(request: Request) {
  try {
    const { ensureAdminApp } = await import('@/lib/firebase-admin');
    ensureAdminApp();
    await verifySuperAdmin(request);

    const db = adminSql();

    const rows = await db`
      SELECT
        a.id,
        a.name_ar             AS "nameAr",
        a.name_en             AS "nameEn",
        a.vat_number          AS "vatNumber",
        a.subscription_plan   AS "subscriptionPlan",
        a.subscription_status AS "subscriptionStatus",
        a.trial_ends_at       AS "trialEndsAt",
        a.subscription_ends_at AS "subscriptionEndsAt",
        a.max_users           AS "maxUsers",
        a.is_active           AS "isActive",
        a.created_at          AS "createdAt",
        COUNT(u.id)::int      AS "userCount"
      FROM agencies a
      LEFT JOIN users u ON u.agency_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `;

    return NextResponse.json({ agencies: rows });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error('[admin/agencies]', msg);
    return NextResponse.json({ error: 'خطأ في تحميل البيانات' }, { status: 500 });
  }
}
