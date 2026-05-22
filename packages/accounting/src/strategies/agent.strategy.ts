/**
 * @masarat/accounting — Agent Revenue Strategy
 *
 * نموذج الوكيل (IFRS 15 — Agent):
 * الوكالة وسيط بين العميل والمورد. الإيراد = العمولة + رسوم الخدمة فقط (لا المبلغ الإجمالي).
 *
 * المرحلتان:
 *   1. agent_payment_received  → استلام الدفعة (كل المبلغ مطلوب للعميل، الإيراد مؤجَّل)
 *   2. agent_service_delivered → إصدار التذكرة/الخدمة (تحرير الأمانة، اعتراف بالإيراد)
 */

import type {
  AgentPaymentReceivedInput,
  AgentServiceDeliveredInput,
  AgencyAccountingConfig,
  BookingType,
  JournalLine,
  AccountMapping,
  Halalas,
} from '../types';

// ─── المرحلة 1: استلام الدفعة ────────────────────────────────────────────────

/**
 * يُولِّد سطور القيد عند استلام الدفعة في نموذج الوكيل.
 *
 * المنطق المحاسبي:
 *   DR النقد/البنك          [costPrice + serviceFee + vatOnServiceFee]
 *     CR أمانات العملاء       [costPrice]          — مطلوب، ليس إيراداً بعد
 *     CR إيراد مؤجل — خدمة   [serviceFee]         — مؤجَّل حتى تقديم الخدمة
 *     CR VAT Output           [vatOnServiceFee]    — معترف به الآن (نقطة الضريبة)
 *
 * ملاحظة VAT: نقطة الضريبة على رسوم الخدمة هي لحظة الاستلام (Cash Basis للخدمة).
 * أما تكلفة التذكرة نفسها: في نموذج الوكيل لا VAT عليها (الخط يُصدر الفاتورة للعميل).
 */
export function buildAgentPaymentReceivedLines(
  input: AgentPaymentReceivedInput,
  config: AgencyAccountingConfig
): JournalLine[] {
  const { accounts } = config;
  const { costPrice, serviceFee, serviceFeeVatAmount, receivingAccountCode, bookingRef, customerName } = input;

  const totalReceived: Halalas = costPrice + serviceFee + serviceFeeVatAmount;

  const lines: JournalLine[] = [
    // DR: النقد أو البنك — إجمالي ما استُلم
    {
      lineNumber: 1,
      accountCode: receivingAccountCode,
      accountName: { ar: 'النقد / البنك', en: 'Cash / Bank' },
      debit: totalReceived,
      credit: 0,
      description: `استلام دفعة حجز ${bookingRef} — ${customerName}`,
    },
    // CR: أمانات العملاء — قيمة التذكرة/الخدمة (مطلوب، لم تُقدَّم الخدمة بعد)
    {
      lineNumber: 2,
      accountCode: accounts.customerDepositsAccount,
      accountName: { ar: 'أمانات العملاء', en: 'Customer Deposits' },
      debit: 0,
      credit: costPrice,
      description: `أمانة — ${bookingRef} — تُحرَّر عند الإصدار`,
    },
  ];

  // CR: إيراد مؤجل — رسوم الخدمة (تُعترف به عند تقديم الخدمة)
  if (serviceFee > 0) {
    lines.push({
      lineNumber: lines.length + 1,
      accountCode: accounts.deferredRevenueAccount,
      accountName: { ar: 'إيراد مؤجل — رسوم الخدمة', en: 'Deferred Revenue — Service Fee' },
      debit: 0,
      credit: serviceFee,
      description: `رسوم خدمة مؤجلة — ${bookingRef}`,
    });
  }

  // CR: VAT Output — ضريبة رسوم الخدمة (تُعترف بها فوراً عند الاستلام)
  if (serviceFeeVatAmount > 0) {
    lines.push({
      lineNumber: lines.length + 1,
      accountCode: accounts.vatOutputAccount,
      accountName: { ar: 'ضريبة القيمة المضافة — مخرجات', en: 'VAT Output' },
      debit: 0,
      credit: serviceFeeVatAmount,
      description: `VAT على رسوم الخدمة — ${bookingRef}`,
    });
  }

  return lines;
}

// ─── المرحلة 2: تقديم الخدمة (إصدار التذكرة) ────────────────────────────────

/**
 * يُولِّد سطور القيد عند إصدار التذكرة أو تأكيد الخدمة (نموذج الوكيل).
 *
 * المنطق المحاسبي — قيدان منفصلان مدمجان:
 *
 * قيد 1: تحرير الأمانة وإثبات ذمة المورد
 *   DR أمانات العملاء        [customerDepositAmount]
 *     CR ذمم المورد            [netCostToSupplier]
 *     CR إيراد عمولة مورد      [commission = deposit - netCost]  (إذا وجدت)
 *
 * قيد 2: اعتراف برسوم الخدمة المؤجلة
 *   DR إيراد مؤجل            [serviceFee]
 *     CR إيراد رسوم الخدمة    [serviceFee]
 */
export function buildAgentServiceDeliveredLines(
  input: AgentServiceDeliveredInput,
  config: AgencyAccountingConfig
): JournalLine[] {
  const { accounts } = config;
  const { customerDepositAmount, netCostToSupplier, serviceFee, supplierPayableAccountCode, bookingType, isInternational, bookingRef } = input;

  const supplierCommission: Halalas = customerDepositAmount - netCostToSupplier;

  if (supplierCommission < 0) {
    throw new Error(
      `بيانات غير متسقة في ${bookingRef}: ` +
      `الأمانة (${customerDepositAmount}) أقل من تكلفة المورد (${netCostToSupplier}). ` +
      `هذا يعني الوكالة دفعت أكثر مما جمعته — راجع البيانات.`
    );
  }

  const revenueAccountCode = resolveCommissionAccount(bookingType, isInternational, accounts);

  const lines: JournalLine[] = [
    // DR: تحرير أمانة العميل
    {
      lineNumber: 1,
      accountCode: accounts.customerDepositsAccount,
      accountName: { ar: 'أمانات العملاء', en: 'Customer Deposits' },
      debit: customerDepositAmount,
      credit: 0,
      description: `تحرير أمانة — إصدار خدمة — ${bookingRef}`,
    },
    // CR: ذمم المورد (ما تدين به الوكالة للمورد)
    {
      lineNumber: 2,
      accountCode: supplierPayableAccountCode,
      accountName: { ar: 'ذمم الموردون', en: 'Supplier Payable' },
      debit: 0,
      credit: netCostToSupplier,
      description: `مستحقات المورد — ${bookingRef}`,
    },
  ];

  // CR: عمولة من المورد (إن وجدت — نادر في عصر zero commission)
  if (supplierCommission > 0) {
    lines.push({
      lineNumber: lines.length + 1,
      accountCode: revenueAccountCode,
      accountName: { ar: 'إيراد عمولة', en: 'Commission Revenue' },
      debit: 0,
      credit: supplierCommission,
      description: `عمولة من المورد — ${bookingRef}`,
    });
  }

  // قيد تحرير رسوم الخدمة المؤجلة
  if (serviceFee > 0) {
    lines.push(
      // DR: تحرير الإيراد المؤجل
      {
        lineNumber: lines.length + 1,
        accountCode: accounts.deferredRevenueAccount,
        accountName: { ar: 'إيراد مؤجل — رسوم الخدمة', en: 'Deferred Revenue — Service Fee' },
        debit: serviceFee,
        credit: 0,
        description: `تحرير إيراد مؤجل — ${bookingRef}`,
      },
      // CR: إيراد رسوم الخدمة
      {
        lineNumber: lines.length + 2,
        accountCode: accounts.serviceFees,
        accountName: { ar: 'إيراد رسوم الخدمة', en: 'Service Fee Revenue' },
        debit: 0,
        credit: serviceFee,
        description: `اعتراف بإيراد رسوم الخدمة — ${bookingRef}`,
      }
    );
  }

  return lines;
}

// ─── دالة مساعدة: تحديد حساب الإيراد ────────────────────────────────────────

function resolveCommissionAccount(
  bookingType: BookingType,
  isInternational: boolean,
  accounts: AccountMapping
): string {
  switch (bookingType) {
    case 'flight':
      return isInternational
        ? accounts.commissionFlightInternational
        : accounts.commissionFlightDomestic;
    case 'hotel':
      return isInternational
        ? accounts.commissionHotelInternational
        : accounts.commissionHotelDomestic;
    case 'umrah':
    case 'hajj':
      return accounts.commissionUmrahHajj;
    case 'insurance':
      return accounts.commissionInsurance;
    default:
      return accounts.serviceFees;
  }
}
