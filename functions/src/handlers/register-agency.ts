/**
 * registerAgency — Cloud Function Handler
 *
 * تسجيل وكالة سفر جديدة في النظام (عملية ذرية):
 *   1. التحقق من عدم تكرار البريد الإلكتروني
 *   2. إنشاء مستخدم في Firebase Auth (بدون كلمة مرور)
 *   3. تعيين Custom Claims: { agencyId, role: 'admin' }
 *   4. Batch write ذري:
 *      - مستند الوكالة في agencies/{agencyId}
 *      - إعدادات المحاسبة في agencies/{agencyId}/config/accounting
 *      - عدادات الفواتير في agencies/{agencyId}/config/invoice_counters
 *      - مستند المستخدم في users/{uid}
 *      - شجرة الحسابات الافتراضية (دليل حسابات كامل)
 *   5. توليد رابط تعيين كلمة المرور
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterAgencyRequest {
  agencyNameAr: string;
  agencyNameEn: string;
  adminEmail: string;
  adminNameAr: string;
  adminNameEn: string;
  adminMobile: string;
}

export interface RegisterAgencyResult {
  agencyId: string;
  setupLink: string;
}

// ─── Default Chart of Accounts ────────────────────────────────────────────────

const DEFAULT_COA = [
  // أصول
  { code: '1100', nameAr: 'النقدية',                     nameEn: 'Cash',                          type: 'asset',     side: 'debit'  },
  { code: '1110', nameAr: 'البنك',                       nameEn: 'Bank',                          type: 'asset',     side: 'debit'  },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',          nameEn: 'Accounts Receivable',           type: 'asset',     side: 'debit'  },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',   nameEn: 'Prepaid Expenses',              type: 'asset',     side: 'debit'  },
  // التزامات
  { code: '2000', nameAr: 'ذمم دائنة - موردون',         nameEn: 'Accounts Payable - Suppliers',  type: 'liability', side: 'credit' },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',  nameEn: 'Accounts Payable - Airlines',   type: 'liability', side: 'credit' },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',          nameEn: 'Accounts Payable - Hotels',     type: 'liability', side: 'credit' },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة',nameEn: 'VAT Payable',                   type: 'liability', side: 'credit' },
  { code: '2300', nameAr: 'ودائع العملاء',               nameEn: 'Customer Deposits',             type: 'liability', side: 'credit' },
  // حقوق الملكية
  { code: '3100', nameAr: 'رأس مال المالك',              nameEn: 'Owner Capital',                 type: 'equity',    side: 'credit' },
  { code: '3200', nameAr: 'الأرباح المحتجزة',            nameEn: 'Retained Earnings',             type: 'equity',    side: 'credit' },
  // الإيرادات
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',         nameEn: 'Revenue - Agency Fees',         type: 'revenue',   side: 'credit' },
  { code: '4100', nameAr: 'إيراد خدمات السفر',          nameEn: 'Revenue - Travel Services',     type: 'revenue',   side: 'credit' },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',   nameEn: 'Tour Package Revenue',          type: 'revenue',   side: 'credit' },
  { code: '4120', nameAr: 'إيرادات الفنادق',            nameEn: 'Hotel Revenue',                 type: 'revenue',   side: 'credit' },
  { code: '4130', nameAr: 'إيرادات العمرة',             nameEn: 'Umrah Revenue',                 type: 'revenue',   side: 'credit' },
  { code: '4140', nameAr: 'إيرادات التأشيرات',          nameEn: 'Visa Revenue',                  type: 'revenue',   side: 'credit' },
  { code: '4150', nameAr: 'إيرادات التأمين',            nameEn: 'Insurance Revenue',             type: 'revenue',   side: 'credit' },
  // المصاريف
  { code: '5000', nameAr: 'تكلفة الخدمات',              nameEn: 'Cost of Services',              type: 'expense',   side: 'debit'  },
  { code: '5100', nameAr: 'الرواتب والأجور',            nameEn: 'Salaries',                      type: 'expense',   side: 'debit'  },
  { code: '5200', nameAr: 'الإيجار',                    nameEn: 'Rent',                          type: 'expense',   side: 'debit'  },
  { code: '5300', nameAr: 'التسويق والإعلان',           nameEn: 'Marketing',                     type: 'expense',   side: 'debit'  },
  { code: '5400', nameAr: 'المصاريف التشغيلية',         nameEn: 'Operating Expenses',            type: 'expense',   side: 'debit'  },
];

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleRegisterAgency(
  req: RegisterAgencyRequest
): Promise<RegisterAgencyResult> {
  const db   = getFirestore();
  const auth = getAuth();

  // 1. التحقق من البيانات
  const email = req.adminEmail.trim().toLowerCase();
  if (!req.agencyNameAr?.trim() || !email || !req.adminNameAr?.trim()) {
    throw new Error('بيانات مطلوبة ناقصة');
  }

  // 2. التحقق من عدم تكرار البريد
  try {
    await auth.getUserByEmail(email);
    // إذا نجح الأمر فهذا يعني أن المستخدم موجود مسبقاً
    throw new Error('EMAIL_ALREADY_EXISTS');
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string };
    if (e.message === 'EMAIL_ALREADY_EXISTS') {
      throw new Error('هذا البريد الإلكتروني مسجّل مسبقاً في النظام');
    }
    if (e.code !== 'auth/user-not-found') throw err;
    // auth/user-not-found ← الوضع الطبيعي، يمكننا المتابعة
  }

  const now      = Timestamp.now();
  const agencyRef = db.collection('agencies').doc();
  const agencyId  = agencyRef.id;

  // 3. إنشاء حساب Firebase Auth (بدون كلمة مرور — المستخدم يضبطها عبر رابط التعيين)
  const userRecord = await auth.createUser({
    email,
    displayName: req.adminNameAr.trim(),
    emailVerified: false,
    disabled: false,
  });

  // 4. تعيين Custom Claims
  await auth.setCustomUserClaims(userRecord.uid, {
    agencyId,
    role: 'admin',
  });

  // 5. توليد رابط تعيين كلمة المرور
  const setupLink = await auth.generatePasswordResetLink(email);

  // 6. Batch write ذري
  const batch = db.batch();

  // مستند الوكالة
  batch.set(agencyRef, {
    nameAr:             req.agencyNameAr.trim(),
    nameEn:             req.agencyNameEn?.trim() || req.agencyNameAr.trim(),
    contactEmail:       email,
    isVatRegistered:    false,
    isActive:           true,
    plan:               'trial',
    subscriptionStatus: 'trial',
    trialEndDate:       new Timestamp(
      Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60, // now + 14 days
      0
    ),
    createdAt:          now,
    updatedAt:          now,
  });

  // إعدادات المحاسبة
  batch.set(
    db.collection('agencies').doc(agencyId).collection('config').doc('accounting'),
    {
      arAccountCode:      '1120',
      vatAccountCode:     '2200',
      revenueAccountCode: '4000',
      expenseAccountCode: '5000',
      cashAccountCode:    '1100',
      bankAccountCode:    '1110',
    }
  );

  // عدادات الفواتير
  batch.set(
    db.collection('agencies').doc(agencyId).collection('config').doc('invoice_counters'),
    { invoice: 0, receipt: 0, creditNote: 0 }
  );

  // مستند المستخدم المدير
  batch.set(db.collection('users').doc(userRecord.uid), {
    agencyId,
    name:        { ar: req.adminNameAr.trim(), en: req.adminNameEn?.trim() || req.adminNameAr.trim() },
    email,
    mobile:      req.adminMobile?.trim() ?? '',
    role:        'admin',
    preferences: { language: 'ar', theme: 'light' },
    isActive:    true,
    createdAt:   now,
  });

  // دليل الحسابات الافتراضي
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

  return { agencyId, setupLink };
}
