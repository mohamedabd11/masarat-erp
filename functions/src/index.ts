/**
 * @masarat/functions — Firebase Cloud Functions Entry Point
 *
 * جميع الدوال المالية الحساسة تُعرَّض من هنا.
 * الـ Client يستدعيها عبر Firebase Functions SDK.
 */

import { initializeApp } from 'firebase-admin/app';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { handleCreateInvoice, type CreateInvoiceRequest } from './handlers/create-invoice';
import { handleProcessPayment, type ProcessPaymentRequest } from './handlers/process-payment';
import { handleProcessRefund, type ProcessRefundRequest } from './handlers/process-refund';
import { handleRegisterAgency, type RegisterAgencyRequest } from './handlers/register-agency';
import { handleInviteUser, type InviteUserRequest } from './handlers/invite-user';
import {
  handleAdminListAgencies,
  handleAdminUpdateSubscription,
  type AdminUpdateSubscriptionRequest,
} from './handlers/admin';

// تهيئة Firebase Admin SDK مرة واحدة
initializeApp();

// ─── تعريف الدوال ─────────────────────────────────────────────────────────────

/**
 * إصدار فاتورة ضريبية
 * - رقم تسلسلي ذري
 * - قيد محاسبي تلقائي
 * - تحديث حالة الحجز
 * - جدولة إرسال ZATCA
 */
export const createInvoice = onCall<CreateInvoiceRequest>(
  { region: 'me-central2' }, // منطقة الشرق الأوسط (قريبة من السعودية)
  async (request) => {
    const agencyId = request.auth?.token?.['agencyId'];
    if (!agencyId) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    }
    if (agencyId !== request.data.agencyId) {
      throw new HttpsError('permission-denied', 'لا يمكنك إصدار فواتير لوكالة أخرى');
    }

    try {
      return await handleCreateInvoice(request.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير متوقع';
      throw new HttpsError('internal', message);
    }
  }
);

/**
 * تسجيل دفعة من العميل
 * - التحقق من عدم تجاوز المبلغ المستحق
 * - قيد محاسبي تلقائي
 * - تحديث حالة الفاتورة والحجز
 */
export const processPayment = onCall<ProcessPaymentRequest>(
  { region: 'me-central2' },
  async (request) => {
    const agencyId = request.auth?.token?.['agencyId'];
    if (!agencyId) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    }
    if (agencyId !== request.data.agencyId) {
      throw new HttpsError('permission-denied', 'غير مصرح');
    }

    try {
      return await handleProcessPayment(request.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير متوقع';
      // رسائل الأخطاء المحاسبية تُرسَل للـ Client (ليست أخطاء داخلية)
      const code = message.includes('يتجاوز') ? 'invalid-argument' : 'internal';
      throw new HttpsError(code, message);
    }
  }
);

/**
 * معالجة طلب استرداد
 * - إشعار دائن ZATCA تلقائي
 * - قيد عكسي جديد (لا تعديل على القيد الأصلي)
 * - تحديث حالة الحجز → cancelled
 */
export const processRefund = onCall<ProcessRefundRequest>(
  { region: 'me-central2' },
  async (request) => {
    const agencyId = request.auth?.token?.['agencyId'];
    if (!agencyId) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    }

    // الاسترداد يحتاج صلاحية خاصة
    const hasRefundPermission = request.auth?.token?.['perm_payment_refund'] === true;
    if (!hasRefundPermission) {
      throw new HttpsError('permission-denied', 'ليس لديك صلاحية معالجة الاستردادات');
    }

    try {
      return await handleProcessRefund(request.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير متوقع';
      throw new HttpsError('internal', message);
    }
  }
);

/**
 * تسجيل وكالة سفر جديدة (عامة — لا تتطلب تسجيل دخول)
 * تُنشئ: الوكالة، المستخدم المدير، Custom Claims، دليل الحسابات
 * تُعيد: رابط تعيين كلمة المرور للمدير
 */
export const registerAgency = onCall<RegisterAgencyRequest>(
  { region: 'me-central2' },
  async (request) => {
    try {
      return await handleRegisterAgency(request.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير متوقع';
      const code = message.includes('مسجّل مسبقاً') ? 'already-exists' : 'internal';
      throw new HttpsError(code, message);
    }
  }
);

/**
 * دعوة موظف جديد إلى الوكالة (يتطلب صلاحية admin)
 * تُنشئ: حساب Firebase Auth، Custom Claims، مستند users
 * تُعيد: رابط تعيين كلمة المرور للموظف
 */
export const inviteUser = onCall<InviteUserRequest>(
  { region: 'me-central2' },
  async (request) => {
    const callerAgencyId = request.auth?.token?.['agencyId'] as string | undefined;
    const callerRole     = request.auth?.token?.['role']     as string | undefined;
    const callerUid      = request.auth?.uid;

    if (!callerUid || !callerAgencyId) {
      throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    }
    if (callerRole !== 'admin') {
      throw new HttpsError('permission-denied', 'فقط مدير الوكالة يمكنه دعوة مستخدمين');
    }

    try {
      return await handleInviteUser(callerUid, callerAgencyId, callerRole, request.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير متوقع';
      const code = message.includes('مسجّل مسبقاً') ? 'already-exists'
                 : message.includes('PERMISSION')    ? 'permission-denied'
                 : 'internal';
      throw new HttpsError(code, message);
    }
  }
);

/**
 * قائمة جميع الوكالات — Super Admin فقط
 */
export const adminListAgencies = onCall(
  { region: 'me-central2' },
  async (request) => {
    const callerEmail = request.auth?.token?.['email'] as string | undefined;
    try {
      return await handleAdminListAgencies(callerEmail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ';
      const code = message === 'SUPER_ADMIN_ONLY' ? 'permission-denied' : 'internal';
      throw new HttpsError(code, message);
    }
  }
);

/**
 * تحديث حالة اشتراك وكالة — Super Admin فقط
 */
export const adminUpdateSubscription = onCall<AdminUpdateSubscriptionRequest>(
  { region: 'me-central2' },
  async (request) => {
    const callerEmail = request.auth?.token?.['email'] as string | undefined;
    try {
      return await handleAdminUpdateSubscription(callerEmail, request.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ';
      const code = message === 'SUPER_ADMIN_ONLY' ? 'permission-denied' : 'internal';
      throw new HttpsError(code, message);
    }
  }
);
