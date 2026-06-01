import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users, chartOfAccounts } from '@/lib/schema';
import { TRIAL_DAYS } from '@masarat/accounting';

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

const DEFAULT_COA = [
  { code: '1100', nameAr: 'النقدية',                      nameEn: 'Cash',                         type: 'asset',     },
  { code: '1110', nameAr: 'البنك',                        nameEn: 'Bank',                         type: 'asset',     },
  { code: '1115', nameAr: 'نقاط البيع / بطاقات الائتمان', nameEn: 'POS / Credit Cards',           type: 'asset',     },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',           nameEn: 'Accounts Receivable',          type: 'asset',     },
  { code: '1125', nameAr: 'أوراق قبض - شيكات',           nameEn: 'Cheques Receivable',           type: 'asset',     },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',    nameEn: 'Prepaid Expenses',             type: 'asset',     },
  { code: '1350', nameAr: 'مقاصة BSP',                    nameEn: 'BSP Clearing',                 type: 'asset',     },
  { code: '2000', nameAr: 'ذمم دائنة - موردون',          nameEn: 'Accounts Payable - Suppliers', type: 'liability', },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',   nameEn: 'Accounts Payable - Airlines',  type: 'liability', },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',           nameEn: 'Accounts Payable - Hotels',    type: 'liability', },
  { code: '2150', nameAr: 'مستحقات BSP',                  nameEn: 'BSP Payable',                  type: 'liability', },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة', nameEn: 'VAT Payable',                  type: 'liability', },
  { code: '2300', nameAr: 'ودائع العملاء',                nameEn: 'Customer Deposits',            type: 'liability', },
  { code: '3100', nameAr: 'رأس مال المالك',               nameEn: 'Owner Capital',                type: 'equity',    },
  { code: '3200', nameAr: 'الأرباح المحتجزة',             nameEn: 'Retained Earnings',            type: 'equity',    },
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',          nameEn: 'Revenue - Agency Fees',        type: 'revenue',   },
  { code: '4100', nameAr: 'إيراد خدمات السفر',           nameEn: 'Revenue - Travel Services',    type: 'revenue',   },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',    nameEn: 'Tour Package Revenue',         type: 'revenue',   },
  { code: '4120', nameAr: 'إيرادات الفنادق',             nameEn: 'Hotel Revenue',                type: 'revenue',   },
  { code: '4130', nameAr: 'إيرادات العمرة',              nameEn: 'Umrah Revenue',                type: 'revenue',   },
  { code: '4140', nameAr: 'إيرادات التأشيرات',           nameEn: 'Visa Revenue',                 type: 'revenue',   },
  { code: '4150', nameAr: 'إيرادات التأمين',             nameEn: 'Insurance Revenue',            type: 'revenue',   },
  { code: '4420', nameAr: 'إيراد استرداد ADM',           nameEn: 'ADM Recovery Income',          type: 'revenue',   },
  { code: '5000', nameAr: 'تكلفة الخدمات',               nameEn: 'Cost of Services',             type: 'expense',   },
  { code: '5100', nameAr: 'الرواتب والأجور',             nameEn: 'Salaries',                     type: 'expense',   },
  { code: '5200', nameAr: 'الإيجار',                     nameEn: 'Rent',                         type: 'expense',   },
  { code: '5300', nameAr: 'التسويق والإعلان',            nameEn: 'Marketing',                    type: 'expense',   },
  { code: '5400', nameAr: 'المصاريف التشغيلية',          nameEn: 'Operating Expenses',           type: 'expense',   },
  { code: '5420', nameAr: 'مصروف ADM',                   nameEn: 'ADM Expense',                  type: 'expense',   },
] as const;

export async function POST(request: Request) {
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
