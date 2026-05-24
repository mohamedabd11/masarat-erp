/**
 * inviteUser — Cloud Function Handler
 *
 * يُمكّن مدير الوكالة من دعوة موظف جديد:
 *   1. التحقق من صلاحية المستدعي (admin فقط، نفس الوكالة)
 *   2. التحقق من عدم تكرار البريد الإلكتروني
 *   3. إنشاء مستخدم في Firebase Auth
 *   4. تعيين Custom Claims: { agencyId, role }  ← نفس وكالة المدير
 *   5. إنشاء مستند users/{uid}
 *   6. توليد رابط تعيين كلمة المرور للإرسال للموظف
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

export interface InviteUserRequest {
  email: string;
  nameAr: string;
  nameEn: string;
  mobile: string;
  role: UserRole;
}

export interface InviteUserResult {
  userId: string;
  setupLink: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleInviteUser(
  callerUid: string,
  callerAgencyId: string,
  callerRole: string,
  req: InviteUserRequest
): Promise<InviteUserResult> {
  // 1. التحقق من صلاحية المستدعي
  if (callerRole !== 'admin') {
    throw new Error('PERMISSION_DENIED: فقط مدير الوكالة يمكنه دعوة مستخدمين جدد');
  }

  const VALID_ROLES: UserRole[] = ['admin', 'agent', 'accountant', 'viewer'];
  if (!VALID_ROLES.includes(req.role)) {
    throw new Error(`دور غير صالح: ${req.role}`);
  }

  const db    = getFirestore();
  const auth  = getAuth();
  const email = req.email.trim().toLowerCase();

  if (!email || !req.nameAr?.trim()) {
    throw new Error('بيانات مطلوبة ناقصة');
  }

  // 2. التحقق من عدم تكرار البريد
  try {
    await auth.getUserByEmail(email);
    throw new Error('EMAIL_ALREADY_EXISTS');
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string };
    if (e.message === 'EMAIL_ALREADY_EXISTS') {
      throw new Error('هذا البريد الإلكتروني مسجّل مسبقاً في النظام');
    }
    if (e.code !== 'auth/user-not-found') throw err;
  }

  const now = Timestamp.now();

  // 3. إنشاء حساب Firebase Auth
  const userRecord = await auth.createUser({
    email,
    displayName: req.nameAr.trim(),
    emailVerified: false,
    disabled: false,
  });

  // 4. تعيين Custom Claims — نفس agencyId الخاص بالمدير المستدعي
  await auth.setCustomUserClaims(userRecord.uid, {
    agencyId: callerAgencyId,
    role:     req.role,
  });

  // 5. توليد رابط تعيين كلمة المرور
  const setupLink = await auth.generatePasswordResetLink(email);

  // 6. مستند المستخدم
  await db.collection('users').doc(userRecord.uid).set({
    agencyId:    callerAgencyId,
    name:        { ar: req.nameAr.trim(), en: req.nameEn?.trim() || req.nameAr.trim() },
    email,
    mobile:      req.mobile?.trim() ?? '',
    role:        req.role,
    preferences: { language: 'ar', theme: 'light' },
    isActive:    true,
    invitedBy:   callerUid,
    createdAt:   now,
  });

  return { userId: userRecord.uid, setupLink };
}
