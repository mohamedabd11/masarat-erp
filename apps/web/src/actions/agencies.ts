'use server';

/**
 * Agency & User Management Server Actions
 * registerAgency + inviteUser مُحوَّلان لـ PostgreSQL
 */

import { eq, and, count } from 'drizzle-orm';
import {
  agencies,
  agencyAccountingConfigs,
  agencyZatcaConfigs,
  users,
  chartOfAccounts,
} from '@masarat/database/schema';
import { getHttpClient } from '@/lib/db/client';
import { withTransaction } from '@/lib/db/client';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyToken, assertRole, isSuperAdmin, type AuthContext } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

// ─── Default Chart of Accounts (30 حساب مطابق لـ seed.ts) ────────────────────

const DEFAULT_COA = [
  { code: '1100', nameAr: 'الصندوق النقدي', nameEn: 'Cash on Hand', type: 'asset' as const, normalSide: 'debit' as const, isSystem: true },
  { code: '1110', nameAr: 'الحساب البنكي الرئيسي', nameEn: 'Main Bank Account', type: 'asset' as const, normalSide: 'debit' as const, isSystem: true },
  { code: '1115', nameAr: 'نقاط البيع', nameEn: 'POS Terminal', type: 'asset' as const, normalSide: 'debit' as const },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء', nameEn: 'Accounts Receivable', type: 'asset' as const, normalSide: 'debit' as const },
  { code: '1203', nameAr: 'ضريبة القيمة المضافة - مدخلات', nameEn: 'VAT Input', type: 'asset' as const, normalSide: 'debit' as const },
  { code: '1004', nameAr: 'حساب تسوية BSP', nameEn: 'BSP Clearing Account', type: 'asset' as const, normalSide: 'debit' as const },
  { code: '2000', nameAr: 'ذمم دائنة - موردون', nameEn: 'Accounts Payable - Suppliers', type: 'liability' as const, normalSide: 'credit' as const },
  { code: '2100', nameAr: 'ذمم دائنة - شركات طيران', nameEn: 'Accounts Payable - Airlines', type: 'liability' as const, normalSide: 'credit' as const },
  { code: '2101', nameAr: 'ذمم دائنة - فنادق', nameEn: 'Accounts Payable - Hotels', type: 'liability' as const, normalSide: 'credit' as const },
  { code: '2102', nameAr: 'ذمم دائنة - شركات العمرة', nameEn: 'Accounts Payable - Umrah', type: 'liability' as const, normalSide: 'credit' as const },
  { code: '2103', nameAr: 'ذمم دائنة - التأمين', nameEn: 'Accounts Payable - Insurance', type: 'liability' as const, normalSide: 'credit' as const },
  { code: '3101', nameAr: 'ضريبة القيمة المضافة - مخرجات', nameEn: 'VAT Output', type: 'liability' as const, normalSide: 'credit' as const, isSystem: true },
  { code: '3201', nameAr: 'إيراد مؤجل', nameEn: 'Deferred Revenue', type: 'liability' as const, normalSide: 'credit' as const, isSystem: true },
  { code: '3202', nameAr: 'أمانات العملاء', nameEn: 'Customer Deposits', type: 'liability' as const, normalSide: 'credit' as const, isSystem: true },
  { code: '4100', nameAr: 'رأس المال', nameEn: 'Capital', type: 'equity' as const, normalSide: 'credit' as const },
  { code: '4200', nameAr: 'الأرباح المحتجزة', nameEn: 'Retained Earnings', type: 'equity' as const, normalSide: 'credit' as const },
  { code: '6001', nameAr: 'عمولات - طيران داخلي', nameEn: 'Commission - Domestic Flights', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6002', nameAr: 'عمولات - طيران دولي', nameEn: 'Commission - International Flights', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6003', nameAr: 'عمولات - فنادق محلية', nameEn: 'Commission - Domestic Hotels', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6004', nameAr: 'عمولات - فنادق دولية', nameEn: 'Commission - International Hotels', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6005', nameAr: 'عمولات - عمرة وحج', nameEn: 'Commission - Umrah & Hajj', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6006', nameAr: 'عمولات - تأمين', nameEn: 'Commission - Insurance', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6007', nameAr: 'رسوم الخدمة والإلغاء', nameEn: 'Service & Cancellation Fees', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '6101', nameAr: 'إيراد الباقات السياحية', nameEn: 'Package Revenue', type: 'revenue' as const, normalSide: 'credit' as const },
  { code: '7001', nameAr: 'تكلفة تذاكر الطيران', nameEn: 'Cost of Flights', type: 'expense' as const, normalSide: 'debit' as const },
  { code: '7002', nameAr: 'تكلفة الفنادق', nameEn: 'Cost of Hotels', type: 'expense' as const, normalSide: 'debit' as const },
  { code: '7003', nameAr: 'تكلفة الباقات', nameEn: 'Cost of Packages', type: 'expense' as const, normalSide: 'debit' as const },
  { code: '8100', nameAr: 'رواتب وأجور', nameEn: 'Salaries & Wages', type: 'expense' as const, normalSide: 'debit' as const },
  { code: '8200', nameAr: 'إيجار المكتب', nameEn: 'Office Rent', type: 'expense' as const, normalSide: 'debit' as const },
  { code: '8399', nameAr: 'فروق التقريب', nameEn: 'Rounding Differences', type: 'expense' as const, normalSide: 'debit' as const, isSystem: true, allowManualEntry: false },
];

// ─── registerAgency ───────────────────────────────────────────────────────────

export interface RegisterAgencyInput {
  agencyNameAr: string;
  agencyNameEn: string;
  adminEmail: string;
  adminNameAr: string;
  adminNameEn: string;
  adminMobile: string;
}

export interface RegisterAgencyResult {
  agencyId: string;
  userId: string;
  setupLink: string;
}

export async function registerAgencyAction(
  input: RegisterAgencyInput
): Promise<{ success: true; data: RegisterAgencyResult } | { success: false; error: string }> {
  const email = input.adminEmail.trim().toLowerCase();

  if (!input.agencyNameAr?.trim() || !email || !input.adminNameAr?.trim()) {
    return { success: false, error: 'بيانات مطلوبة ناقصة' };
  }

  ensureAdminApp();
  const { getAuth } = await import('firebase-admin/auth');

  // التحقق من عدم تكرار البريد
  try {
    await getAuth().getUserByEmail(email);
    return { success: false, error: 'هذا البريد الإلكتروني مسجّل مسبقاً' };
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code !== 'auth/user-not-found') {
      return { success: false, error: 'خطأ في التحقق من البريد الإلكتروني' };
    }
  }

  const agencyId = crypto.randomUUID();
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  try {
    // إنشاء مستخدم Firebase
    const userRecord = await getAuth().createUser({
      email,
      displayName: input.adminNameAr.trim(),
      emailVerified: false,
      disabled: false,
    });

    // تعيين Custom Claims
    await getAuth().setCustomUserClaims(userRecord.uid, {
      agencyId,
      role: 'admin',
      subscriptionPlan: 'trial',
      subscriptionStatus: 'trial',
    });

    // رابط تعيين كلمة المرور
    const setupLink = await getAuth().generatePasswordResetLink(email);

    // كتابة كل شيء في PostgreSQL داخل transaction واحد
    // لا نستخدم withTransaction هنا لأن agencyId جديد (RLS لم يُضبط بعد)
    // نستخدم بدلاً منه app_migrations role
    const db = getHttpClient();

    await db.transaction(async (tx) => {
      // الوكالة
      await tx.insert(agencies).values({
        id: agencyId,
        nameAr: input.agencyNameAr.trim(),
        nameEn: input.agencyNameEn?.trim() || input.agencyNameAr.trim(),
        subscriptionPlan: 'trial',
        subscriptionStatus: 'trial',
        trialEndsAt,
        maxUsers: 2,
        isActive: true,
        firebaseAdminUid: userRecord.uid,
      });

      // إعدادات المحاسبة
      await tx.insert(agencyAccountingConfigs).values({
        agencyId,
        vatRateBps: 1500,
        accountMapping: {
          mainCashAccount: '1100',
          mainBankAccount: '1110',
          bspClearingAccount: '1004',
          customerDepositsAccount: '3202',
          deferredRevenueAccount: '3201',
          commissionFlightDomestic: '6001',
          commissionFlightInternational: '6002',
          commissionHotelDomestic: '6003',
          commissionHotelInternational: '6004',
          commissionUmrahHajj: '6005',
          commissionInsurance: '6006',
          serviceFees: '6007',
          packageRevenue: '6101',
          flightCostAccount: '7001',
          hotelCostAccount: '7002',
          packageCostAccount: '7003',
          airlinePayableAccount: '2100',
          hotelPayableAccount: '2101',
          umrahPayableAccount: '2102',
          insurancePayableAccount: '2103',
          vatOutputAccount: '3101',
          vatInputAccount: '1203',
          roundingDifferenceAccount: '8399',
        },
        defaultRevenueModels: {
          flight: 'agent',
          hotel: 'agent',
          package: 'principal',
          umrah: 'principal',
          hajj: 'principal',
          insurance: 'agent',
          visa: 'agent',
          transport: 'agent',
        },
      });

      // المستخدم
      await tx.insert(users).values({
        agencyId,
        firebaseUid: userRecord.uid,
        email,
        nameAr: input.adminNameAr.trim(),
        nameEn: input.adminNameEn?.trim() || input.adminNameAr.trim(),
        mobile: input.adminMobile?.trim() || null,
        role: 'admin',
        isActive: true,
      });

      // دليل الحسابات
      await tx.insert(chartOfAccounts).values(
        DEFAULT_COA.map((account) => ({
          agencyId,
          code: account.code,
          nameAr: account.nameAr,
          nameEn: account.nameEn,
          type: account.type,
          normalSide: account.normalSide,
          isSystem: account.isSystem ?? false,
          allowManualEntry: account.allowManualEntry ?? true,
          balanceHalalas: 0n,
        }))
      );
    });

    return {
      success: true,
      data: { agencyId, userId: userRecord.uid, setupLink },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'فشل في تسجيل الوكالة',
    };
  }
}

// ─── inviteUser ────────────────────────────────────────────────────────────────

export interface InviteUserInput {
  email: string;
  nameAr: string;
  nameEn: string;
  mobile: string;
  role: 'admin' | 'agent' | 'accountant' | 'viewer';
}

export interface InviteUserResult {
  userId: string;
  setupLink: string;
}

export async function inviteUserAction(
  idToken: string,
  input: InviteUserInput
): Promise<{ success: true; data: InviteUserResult } | { success: false; error: string }> {
  let auth: AuthContext;
  try {
    auth = await verifyToken(idToken);
    assertRole(auth, ['admin']);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unauthorized' };
  }

  const { agencyId } = auth;
  const email = input.email.trim().toLowerCase();

  if (!email || !input.nameAr?.trim()) {
    return { success: false, error: 'بيانات مطلوبة ناقصة' };
  }

  const VALID_ROLES = ['admin', 'agent', 'accountant', 'viewer'];
  if (!VALID_ROLES.includes(input.role)) {
    return { success: false, error: `دور غير صالح: ${input.role}` };
  }

  // التحقق من حدود الخطة
  const db = getHttpClient();
  const [agency] = await db
    .select({ maxUsers: agencies.maxUsers, plan: agencies.subscriptionPlan })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);

  if (agency) {
    const [{ value: currentUserCount }] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.agencyId, agencyId), eq(users.isActive, true)));

    if (Number(currentUserCount) >= agency.maxUsers) {
      return {
        success: false,
        error: `لقد وصلت للحد الأقصى من المستخدمين (${agency.maxUsers}) في خطتك الحالية. يرجى ترقية الاشتراك.`,
      };
    }
  }

  ensureAdminApp();
  const { getAuth } = await import('firebase-admin/auth');

  try {
    await getAuth().getUserByEmail(email);
    return { success: false, error: 'هذا البريد الإلكتروني مسجّل مسبقاً' };
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code !== 'auth/user-not-found') {
      return { success: false, error: 'خطأ في التحقق من البريد الإلكتروني' };
    }
  }

  try {
    const userRecord = await getAuth().createUser({
      email,
      displayName: input.nameAr.trim(),
      emailVerified: false,
    });

    await getAuth().setCustomUserClaims(userRecord.uid, {
      agencyId,
      role: input.role,
    });

    const setupLink = await getAuth().generatePasswordResetLink(email);

    await db.insert(users).values({
      agencyId,
      firebaseUid: userRecord.uid,
      email,
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn?.trim() || input.nameAr.trim(),
      mobile: input.mobile?.trim() || null,
      role: input.role,
      isActive: true,
      createdBy: auth.uid as unknown as undefined,
    });

    return { success: true, data: { userId: userRecord.uid, setupLink } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'فشل في دعوة المستخدم',
    };
  }
}
