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
  { region: 'me-central1' }, // منطقة الشرق الأوسط (قريبة من السعودية)
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
  { region: 'me-central1' },
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
  { region: 'me-central1' },
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
