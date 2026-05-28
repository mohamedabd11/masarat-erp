import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users, chartOfAccounts } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const DEFAULT_COA = [
  { code: '1100', nameAr: 'النقدية',                      nameEn: 'Cash',                         type: 'asset'     },
  { code: '1110', nameAr: 'البنك',                        nameEn: 'Bank',                         type: 'asset'     },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',           nameEn: 'Accounts Receivable',          type: 'asset'     },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',    nameEn: 'Prepaid Expenses',             type: 'asset'     },
  { code: '2000', nameAr: 'ذمم دائنة - موردون',          nameEn: 'Accounts Payable - Suppliers', type: 'liability' },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',   nameEn: 'Accounts Payable - Airlines',  type: 'liability' },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',           nameEn: 'Accounts Payable - Hotels',    type: 'liability' },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة', nameEn: 'VAT Payable',                  type: 'liability' },
  { code: '2300', nameAr: 'ودائع العملاء',                nameEn: 'Customer Deposits',            type: 'liability' },
  { code: '3100', nameAr: 'رأس مال المالك',               nameEn: 'Owner Capital',                type: 'equity'    },
  { code: '3200', nameAr: 'الأرباح المحتجزة',             nameEn: 'Retained Earnings',            type: 'equity'    },
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',          nameEn: 'Revenue - Agency Fees',        type: 'revenue'   },
  { code: '4100', nameAr: 'إيراد خدمات السفر',           nameEn: 'Revenue - Travel Services',    type: 'revenue'   },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',    nameEn: 'Tour Package Revenue',         type: 'revenue'   },
  { code: '4120', nameAr: 'إيرادات الفنادق',             nameEn: 'Hotel Revenue',                type: 'revenue'   },
  { code: '4130', nameAr: 'إيرادات العمرة',              nameEn: 'Umrah Revenue',                type: 'revenue'   },
  { code: '4140', nameAr: 'إيرادات التأشيرات',           nameEn: 'Visa Revenue',                 type: 'revenue'   },
  { code: '4150', nameAr: 'إيرادات التأمين',             nameEn: 'Insurance Revenue',            type: 'revenue'   },
  { code: '5000', nameAr: 'تكلفة الخدمات',               nameEn: 'Cost of Services',             type: 'expense'   },
  { code: '5100', nameAr: 'الرواتب والأجور',             nameEn: 'Salaries',                     type: 'expense'   },
  { code: '5200', nameAr: 'الإيجار',                     nameEn: 'Rent',                         type: 'expense'   },
  { code: '5300', nameAr: 'التسويق والإعلان',            nameEn: 'Marketing',                    type: 'expense'   },
  { code: '5400', nameAr: 'المصاريف التشغيلية',          nameEn: 'Operating Expenses',           type: 'expense'   },
] as const;

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
      return NextResponse.json({ synced: false, reason: 'no_agency' });
    }

    const uid    = decoded.uid;
    const email  = decoded.email ?? '';
    const role   = (decoded['role'] as string) ?? 'staff';
    const nameAr = (decoded['name_ar'] as string) ?? decoded.name ?? email;
    const nameEn = decoded.name ?? nameAr;

    // Ensure the agency row exists in Postgres.
    // Users registered before the DB was provisioned (or from the old Firestore-based
    // system) have valid Firebase claims but no Postgres record — create it here.
    const [existingAgency] = await db
      .select({ id: agencies.id })
      .from(agencies)
      .where(eq(agencies.id, agencyId));

    if (!existingAgency) {
      await db.transaction(async (tx) => {
        await tx.insert(agencies).values({
          id:                 agencyId,
          nameAr:             nameAr,
          nameEn:             nameEn,
          email,
          plan:               'trial',
          subscriptionStatus: 'trial',
          trialEndDate:       new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          isActive:           true,
          isVatRegistered:    false,
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
    }

    // Upsert user row
    await db
      .insert(users)
      .values({ id: uid, agencyId, email, nameAr, nameEn, role, isActive: true })
      .onConflictDoUpdate({
        target: users.id,
        set: { email, nameAr, nameEn, role, updatedAt: new Date() },
      });

    const [row] = await db.select().from(users).where(eq(users.id, uid));

    return NextResponse.json({ synced: true, agencyCreated: !existingAgency, user: row });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف';
    console.error(JSON.stringify({ event: 'auth_sync_failed', error: message }));
    return NextResponse.json({ error: 'فشل مزامنة المستخدم' }, { status: 500 });
  }
}
