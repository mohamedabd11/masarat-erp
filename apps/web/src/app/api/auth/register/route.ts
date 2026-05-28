import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';

// ─── Validation helpers ───────────────────────────────────────────────────────

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE  = /^[+\d\s\-()]{7,20}$/;
const MAX_NAME  = 100;
const MAX_EMAIL = 254;

function validateEmail(v: string): string | null {
  if (!EMAIL_RE.test(v)) return 'صيغة البريد الإلكتروني غير صحيحة';
  if (v.length > MAX_EMAIL) return 'البريد الإلكتروني طويل جداً';
  return null;
}

function validateName(v: string, label: string): string | null {
  if (!v.trim()) return `${label} مطلوب`;
  if (v.trim().length > MAX_NAME) return `${label} يجب ألا يتجاوز ${MAX_NAME} حرفاً`;
  return null;
}

function validatePhone(v: string): string | null {
  if (!PHONE_RE.test(v)) return 'رقم الهاتف غير صالح — أرقام وعلامات (+, -, مسافة) فقط';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

interface RegisterAgencyRequest {
  agencyNameAr: string;
  agencyNameEn?: string;
  adminEmail: string;
  adminNameAr: string;
  adminNameEn?: string;
  adminMobile?: string;
}

export async function POST(request: Request) {
  try {
    ensureAdminApp();

    const body = await request.json() as RegisterAgencyRequest;
    const { agencyNameAr, agencyNameEn, adminEmail, adminNameAr, adminNameEn, adminMobile } = body;

    const email = adminEmail?.trim().toLowerCase();

    // ── Input validation ──────────────────────────────────────────────────────
    const errors: string[] = [];
    const nameErr     = validateName(agencyNameAr ?? '', 'اسم الوكالة بالعربي');
    const adminErr    = validateName(adminNameAr   ?? '', 'اسم المدير بالعربي');
    const emailErr    = validateEmail(email ?? '');
    if (nameErr)  errors.push(nameErr);
    if (adminErr) errors.push(adminErr);
    if (emailErr) errors.push(emailErr);
    if (agencyNameEn && agencyNameEn.trim().length > MAX_NAME)
      errors.push(`اسم الوكالة بالإنجليزي يجب ألا يتجاوز ${MAX_NAME} حرفاً`);
    if (adminMobile) {
      const phoneErr = validatePhone(adminMobile.trim());
      if (phoneErr) errors.push(phoneErr);
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const auth = getAuth();
    const db   = getFirestore();

    // التحقق من عدم تكرار البريد
    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً في النظام' }, { status: 409 });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }

    const now      = Timestamp.now();
    const agencyRef = db.collection('agencies').doc();
    const agencyId  = agencyRef.id;

    const userRecord = await auth.createUser({
      email,
      displayName: adminNameAr.trim(),
      emailVerified: false,
      disabled: false,
    });

    await auth.setCustomUserClaims(userRecord.uid, { agencyId, role: 'admin' });

    const setupLink = await auth.generatePasswordResetLink(email);

    const DEFAULT_COA = [
      { code: '1100', nameAr: 'النقدية',                     nameEn: 'Cash',                          type: 'asset',     side: 'debit'  },
      { code: '1110', nameAr: 'البنك',                       nameEn: 'Bank',                          type: 'asset',     side: 'debit'  },
      { code: '1120', nameAr: 'ذمم مدينة - عملاء',          nameEn: 'Accounts Receivable',           type: 'asset',     side: 'debit'  },
      { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',   nameEn: 'Prepaid Expenses',              type: 'asset',     side: 'debit'  },
      { code: '2000', nameAr: 'ذمم دائنة - موردون',         nameEn: 'Accounts Payable - Suppliers',  type: 'liability', side: 'credit' },
      { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',  nameEn: 'Accounts Payable - Airlines',   type: 'liability', side: 'credit' },
      { code: '2110', nameAr: 'ذمم دائنة — فنادق',          nameEn: 'Accounts Payable - Hotels',     type: 'liability', side: 'credit' },
      { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة',nameEn: 'VAT Payable',                   type: 'liability', side: 'credit' },
      { code: '2300', nameAr: 'ودائع العملاء',               nameEn: 'Customer Deposits',             type: 'liability', side: 'credit' },
      { code: '3100', nameAr: 'رأس مال المالك',              nameEn: 'Owner Capital',                 type: 'equity',    side: 'credit' },
      { code: '3200', nameAr: 'الأرباح المحتجزة',            nameEn: 'Retained Earnings',             type: 'equity',    side: 'credit' },
      { code: '4000', nameAr: 'إيراد رسوم الوكالة',         nameEn: 'Revenue - Agency Fees',         type: 'revenue',   side: 'credit' },
      { code: '4100', nameAr: 'إيراد خدمات السفر',          nameEn: 'Revenue - Travel Services',     type: 'revenue',   side: 'credit' },
      { code: '4110', nameAr: 'إيرادات الباقات السياحية',   nameEn: 'Tour Package Revenue',          type: 'revenue',   side: 'credit' },
      { code: '4120', nameAr: 'إيرادات الفنادق',            nameEn: 'Hotel Revenue',                 type: 'revenue',   side: 'credit' },
      { code: '4130', nameAr: 'إيرادات العمرة',             nameEn: 'Umrah Revenue',                 type: 'revenue',   side: 'credit' },
      { code: '4140', nameAr: 'إيرادات التأشيرات',          nameEn: 'Visa Revenue',                  type: 'revenue',   side: 'credit' },
      { code: '4150', nameAr: 'إيرادات التأمين',            nameEn: 'Insurance Revenue',             type: 'revenue',   side: 'credit' },
      { code: '5000', nameAr: 'تكلفة الخدمات',              nameEn: 'Cost of Services',              type: 'expense',   side: 'debit'  },
      { code: '5100', nameAr: 'الرواتب والأجور',            nameEn: 'Salaries',                      type: 'expense',   side: 'debit'  },
      { code: '5200', nameAr: 'الإيجار',                    nameEn: 'Rent',                          type: 'expense',   side: 'debit'  },
      { code: '5300', nameAr: 'التسويق والإعلان',           nameEn: 'Marketing',                     type: 'expense',   side: 'debit'  },
      { code: '5400', nameAr: 'المصاريف التشغيلية',         nameEn: 'Operating Expenses',            type: 'expense',   side: 'debit'  },
    ];

    const batch = db.batch();

    batch.set(agencyRef, {
      nameAr:             agencyNameAr.trim(),
      nameEn:             agencyNameEn?.trim() || agencyNameAr.trim(),
      contactEmail:       email,
      isVatRegistered:    false,
      isActive:           true,
      plan:               'trial',
      subscriptionStatus: 'trial',
      trialEndDate:       new Timestamp(Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60, 0),
      createdAt:          now,
      updatedAt:          now,
    });

    batch.set(
      db.collection('agencies').doc(agencyId).collection('config').doc('accounting'),
      { arAccountCode: '1120', vatAccountCode: '2200', revenueAccountCode: '4000', expenseAccountCode: '5000', cashAccountCode: '1100', bankAccountCode: '1110' }
    );

    batch.set(
      db.collection('agencies').doc(agencyId).collection('config').doc('invoice_counters'),
      { invoice: 0, receipt: 0, creditNote: 0 }
    );

    batch.set(db.collection('users').doc(userRecord.uid), {
      agencyId,
      name:        { ar: adminNameAr.trim(), en: adminNameEn?.trim() || adminNameAr.trim() },
      email,
      mobile:      adminMobile?.trim() ?? '',
      role:        'admin',
      preferences: { language: 'ar', theme: 'light' },
      isActive:    true,
      createdAt:   now,
    });

    for (const account of DEFAULT_COA) {
      batch.set(db.collection('chart_of_accounts').doc(), {
        ...account,
        agencyId,
        balanceHalalas: 0,
        createdAt:      now.toMillis(),
        updatedAt:      now.toMillis(),
      });
    }

    await batch.commit();

    return NextResponse.json({ agencyId, setupLink });
  } catch (err: unknown) {
    console.error('[auth/register]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
