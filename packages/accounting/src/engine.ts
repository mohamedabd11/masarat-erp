/**
 * @masarat/accounting — Accounting Engine
 *
 * الدالة الرئيسية: generateJournalEntry
 *
 * تقبل أي معاملة → توجهها للاستراتيجية الصحيحة → تتحقق من التوازن → تُعيد النتيجة.
 * لا تكتب في قاعدة البيانات — هذا عمل الـ Cloud Function التي تستدعيها.
 */

import type {
  TransactionInput,
  JournalEntryResult,
  AgencyAccountingConfig,
  JournalLine,
  JournalEntryType,
  BookingType,
  RevenueModel,
  RefundInput,
  Halalas,
} from './types';

import {
  buildAgentPaymentReceivedLines,
  buildAgentServiceDeliveredLines,
} from './strategies/agent.strategy';

import {
  buildPrincipalPaymentReceivedLines,
  buildPrincipalRevenueRecognitionLines,
} from './strategies/principal.strategy';

import { validateAndCorrect } from './validator';

// ─── الدالة الرئيسية ─────────────────────────────────────────────────────────

/**
 * يُولِّد قيداً يومياً متوازناً لأي معاملة في النظام.
 *
 * @param input   - بيانات المعاملة (النوع يحدد الاستراتيجية تلقائياً)
 * @param config  - إعدادات المحاسبة للوكالة (خريطة الحسابات + معدل VAT)
 * @returns       قيد يومي متوازن مضمون (isBalanced: true دائماً)
 * @throws        AccountingValidationError إذا كان الفرق أكبر من 1 هللة
 * @throws        Error إذا كانت بيانات المدخل غير متسقة
 */
export function generateJournalEntry(
  input: TransactionInput,
  config: AgencyAccountingConfig
): JournalEntryResult {
  // ── توجيه الاستراتيجية ────────────────────────────────────────────────────
  let rawLines: JournalLine[];
  let entryType: JournalEntryType;
  let revenueModel: RevenueModel;
  let bookingType: BookingType;
  let isInternational: boolean | undefined;

  switch (input.phase) {
    case 'agent_payment_received':
      rawLines = buildAgentPaymentReceivedLines(input, config);
      entryType = 'payment_received';
      revenueModel = 'agent';
      bookingType = input.bookingType;
      isInternational = input.isInternational;
      break;

    case 'agent_service_delivered':
      rawLines = buildAgentServiceDeliveredLines(input, config);
      entryType = 'ticket_issued';
      revenueModel = 'agent';
      bookingType = input.bookingType;
      isInternational = input.isInternational;
      break;

    case 'principal_payment_received':
      rawLines = buildPrincipalPaymentReceivedLines(input, config);
      entryType = 'payment_received';
      revenueModel = 'principal';
      bookingType = input.bookingType;
      isInternational = false;
      break;

    case 'principal_revenue_recognition':
      rawLines = buildPrincipalRevenueRecognitionLines(input, config);
      entryType = 'package_revenue_recognized';
      revenueModel = 'principal';
      bookingType = input.bookingType;
      isInternational = false;
      break;

    case 'refund_issued':
      rawLines = buildRefundLines(input, config);
      entryType = 'refund_payment';
      revenueModel = 'agent'; // الاسترداد يعمل بنفس الطريقة لكلا النموذجين
      bookingType = 'flight'; // placeholder — الاسترداد لا يعتمد على نوع الحجز
      isInternational = undefined;
      break;

    default: {
      const exhaustiveCheck: never = input;
      throw new Error(`نوع معاملة غير معروف: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }

  // ── صمام الأمان: التحقق من التوازن وتصحيح التقريب ─────────────────────────
  const { lines: validatedLines, hadRoundingCorrection } = validateAndCorrect(
    rawLines,
    config.accounts.roundingDifferenceAccount,
    { ar: 'فروق التقريب الضريبي', en: 'Tax Rounding Differences' }
  );

  // ── حساب الإجماليات النهائية ───────────────────────────────────────────────
  const totalDebit = validatedLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = validatedLines.reduce((s, l) => s + l.credit, 0);

  // هذا يجب أن يكون صحيحاً دائماً بعد validateAndCorrect
  // لكن نُضيف assertion دفاعية
  if (totalDebit !== totalCredit) {
    throw new Error(
      `خطأ داخلي في المحرك: القيد غير متوازن بعد التصحيح ` +
      `(${totalDebit} ≠ ${totalCredit}). الرجاء الإبلاغ عن هذا الخطأ.`
    );
  }

  return {
    type: entryType,
    description: buildDescription(input),
    lines: validatedLines,
    totalDebit,
    totalCredit,
    isBalanced: true,
    metadata: {
      revenueModel,
      bookingType,
      isInternational,
      generatedAt: new Date(),
      hadRoundingCorrection,
    },
  };
}

// ─── قيد الاسترداد ───────────────────────────────────────────────────────────

/**
 * يُولِّد قيد الاسترداد.
 *
 * السيناريو: إلغاء حجز مع رسوم إلغاء جزئية.
 *   DR ذمم مدينة من المورد       [refundAmount + cancellationFee]  — ما سيُستردّ من المورد
 *     CR النقد/البنك               [refundAmountToCustomer]           — يُعاد للعميل
 *     CR إيراد رسوم الإلغاء        [cancellationFee]                  — ربح الوكالة
 *     CR VAT Output               [cancellationFeeVat]               — ضريبة الإلغاء
 *
 * ملاحظة: هذا القيد يسجل الذمة من المورد. قيد منفصل يُسجَّل عند استلام المبلغ فعلاً.
 */
function buildRefundLines(
  input: RefundInput,
  config: AgencyAccountingConfig
): JournalLine[] {
  const { accounts } = config;
  const {
    refundAmountToCustomer,
    cancellationFee,
    cancellationFeeVat,
    supplierRefundReceivableAccount,
    refundPaymentAccountCode,
    bookingRef,
    customerName,
  } = input;

  const totalFromSupplier: Halalas = refundAmountToCustomer + cancellationFee + cancellationFeeVat;

  const lines: JournalLine[] = [
    // DR: ذمم مدينة من المورد (سيُسدَّد عندما يُرسل المورد المبلغ)
    {
      lineNumber: 1,
      accountCode: supplierRefundReceivableAccount,
      accountName: { ar: 'ذمم مدينة — مورد (مبالغ مستردة)', en: 'Supplier Refund Receivable' },
      debit: totalFromSupplier,
      credit: 0,
      description: `طلب استرداد من المورد — ${bookingRef}`,
    },
    // CR: ما يُعاد للعميل نقداً أو تحويلاً
    {
      lineNumber: 2,
      accountCode: refundPaymentAccountCode,
      accountName: { ar: 'النقد / البنك — استرداد للعميل', en: 'Cash / Bank — Customer Refund' },
      debit: 0,
      credit: refundAmountToCustomer,
      description: `استرداد للعميل ${customerName} — ${bookingRef}`,
    },
  ];

  // CR: رسوم الإلغاء (إيراد للوكالة)
  if (cancellationFee > 0) {
    lines.push({
      lineNumber: lines.length + 1,
      accountCode: accounts.serviceFees,
      accountName: { ar: 'إيراد رسوم الإلغاء', en: 'Cancellation Fee Revenue' },
      debit: 0,
      credit: cancellationFee,
      description: `رسوم إلغاء — ${bookingRef}`,
    });
  }

  // CR: VAT على رسوم الإلغاء
  if (cancellationFeeVat > 0) {
    lines.push({
      lineNumber: lines.length + 1,
      accountCode: accounts.vatOutputAccount,
      accountName: { ar: 'VAT على رسوم الإلغاء', en: 'VAT on Cancellation Fee' },
      debit: 0,
      credit: cancellationFeeVat,
      description: `VAT رسوم إلغاء — ${bookingRef}`,
    });
  }

  return lines;
}

// ─── وصف القيد ───────────────────────────────────────────────────────────────

function buildDescription(input: TransactionInput): string {
  const ref = 'bookingRef' in input ? input.bookingRef : 'N/A';

  const descriptions: Record<TransactionInput['phase'], string> = {
    agent_payment_received:        `استلام دفعة (وكيل) — ${ref}`,
    agent_service_delivered:       `إصدار خدمة (وكيل) — ${ref}`,
    principal_payment_received:    `استلام دفعة باقة (أصيل) — ${ref}`,
    principal_revenue_recognition: `اعتراف بإيراد باقة (أصيل) — ${ref}`,
    refund_issued:                 `استرداد مبلغ — ${ref}`,
  };

  return descriptions[input.phase];
}
