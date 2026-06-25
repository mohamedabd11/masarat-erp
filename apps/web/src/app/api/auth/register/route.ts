import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users, chartOfAccounts } from '@/lib/schema';
import { TRIAL_DAYS } from '@masarat/accounting';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { DEFAULT_COA } from '@/lib/default-coa';

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE  = /^[+\d\s\-()]{7,20}$/;
const MAX_NAME  = 100;
const MAX_EMAIL = 254;

interface RegisterBody {
  agencyNameAr: string;
  agencyNameEn?: string;
  adminEmail: string;
  adminNameAr: string;
  adminNameEn?: string;
  adminMobile?: string;
  password: string;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, 'register');
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let firebaseUid: string | null = null;

  try {
    ensureAdminApp();

    // Optional guard: set REGISTRATION_SECRET env var to require a token on this endpoint.
    // If the env var is not set, the endpoint remains open (default behaviour for SaaS onboarding).
    const REGISTRATION_SECRET = process.env['REGISTRATION_SECRET'];
    if (REGISTRATION_SECRET) {
      const provided = request.headers.get('x-registration-token') ?? '';
      if (provided !== REGISTRATION_SECRET) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
      }
    }

    const body = await request.json() as RegisterBody;
    const { agencyNameAr, agencyNameEn, adminEmail, adminNameAr, adminNameEn, password } = body;

    const email = adminEmail?.trim().toLowerCase();
    if (!agencyNameAr?.trim())
      return NextResponse.json({ error: 'اسم الوكالة مطلوب' }, { status: 400 });
    if (agencyNameAr.trim().length > MAX_NAME)
      return NextResponse.json({ error: `اسم الوكالة يجب أن لا يتجاوز ${MAX_NAME} حرفاً` }, { status: 400 });
    if (!adminNameAr?.trim())
      return NextResponse.json({ error: 'اسم المدير مطلوب' }, { status: 400 });
    if (adminNameAr.trim().length > MAX_NAME)
      return NextResponse.json({ error: `اسم المدير يجب أن لا يتجاوز ${MAX_NAME} حرفاً` }, { status: 400 });
    if (!email || !EMAIL_RE.test(email) || email.length > MAX_EMAIL)
      return NextResponse.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    if (!password || password.length < 8)
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 });

    const { getAuth } = await import('firebase-admin/auth');
    const auth = getAuth();

    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً في النظام' }, { status: 409 });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }

    const agencyId = crypto.randomUUID();

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: adminNameAr.trim(),
      emailVerified: false,
    });
    firebaseUid = userRecord.uid;

    await auth.setCustomUserClaims(userRecord.uid, { agencyId, role: 'admin' });

    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await tx.insert(agencies).values({
        id:                 agencyId,
        nameAr:             agencyNameAr.trim(),
        nameEn:             agencyNameEn?.trim() || agencyNameAr.trim(),
        email,
        plan:               'trial',
        subscriptionStatus: 'trial',
        trialEndDate:       trialEnd,
        isActive:           true,
        isVatRegistered:    false,
      });

      await tx.insert(users).values({
        id:       userRecord.uid,
        agencyId,
        email,
        nameAr:   adminNameAr.trim(),
        nameEn:   adminNameEn?.trim() || adminNameAr.trim(),
        role:     'admin',
        isActive: true,
      });

      for (const ac of DEFAULT_COA) {
        await tx.insert(chartOfAccounts).values({
          id:       crypto.randomUUID(),
          agencyId,
          code:     ac.code,
          nameAr:   ac.nameAr,
          nameEn:   ac.nameEn,
          type:     ac.type,
          isSystem: true,
          level:    1,
        });
      }
    });

    return NextResponse.json({ agencyId });
  } catch (err: unknown) {
    if (firebaseUid) {
      const { getAuth } = await import('firebase-admin/auth');
      await getAuth().deleteUser(firebaseUid).catch(() => {});
    }
    console.error(JSON.stringify({ event: 'auth_register_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
