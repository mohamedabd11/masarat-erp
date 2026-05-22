/**
 * @masarat/accounting — Principal Revenue Strategy
 *
 * نموذج الأصيل (IFRS 15 — Principal):
 * الوكالة تجمّع المكونات وتبيع باقة متكاملة. الإيراد = سعر البيع الإجمالي.
 * الوكالة تتحمل مخاطر المخزون والأداء.
 *
 * يُستخدم في: الباقات السياحية، العمرة، الحج، allotment الفنادق.
 *
 * المرحلتان:
 *   1. principal_payment_received    → استلام الدفعة (VAT على كامل سعر البيع)
 *   2. principal_revenue_recognition → تقديم الخدمة (اعتراف بالإيراد + تكلفة المبيعات)
 */

import type {
  PrincipalPaymentReceivedInput,
  PrincipalRevenueRecognitionInput,
  AgencyAccountingConfig,
  JournalLine,
  Halalas,
} from '../types';

// ─── المرحلة 1: استلام الدفعة ────────────────────────────────────────────────

/**
 * يُولِّد سطور القيد عند استلام دفعة الباقة (نموذج الأصيل).
 *
 * المنطق المحاسبي:
 *   DR النقد/البنك                [totalAmount = sellingExclVat + vat]
 *     CR إيراد مؤجل — باقات       [sellingPriceExclVat]
 *     CR VAT Output               [vatAmount]
 *
 * الفرق الجوهري عن نموذج الوكيل: VAT محسوب على كامل سعر البيع (لا على العمولة فقط).
 * الوكالة كأصيل تدفع VAT على البيع كاملاً حتى لو اشترت بسعر أقل من المورد.
 */
export function buildPrincipalPaymentReceivedLines(
  input: PrincipalPaymentReceivedInput,
  config: AgencyAccountingConfig
): JournalLine[] {
  const { accounts } = config;
  const { sellingPriceExclVat, vatAmount, totalAmount, receivingAccountCode, bookingRef, customerName } = input;

  // تحقق من صحة مجموع المبالغ
  const expectedTotal: Halalas = sellingPriceExclVat + vatAmount;
  if (expectedTotal !== totalAmount) {
    throw new Error(
      `عدم تطابق في مبالغ ${bookingRef}: ` +
      `sellingPriceExclVat (${sellingPriceExclVat}) + vatAmount (${vatAmount}) = ${expectedTotal} ` +
      `لا تساوي totalAmount (${totalAmount})`
    );
  }

  const lines: JournalLine[] = [
    // DR: النقد أو البنك — المبلغ الإجمالي شامل VAT
    {
      lineNumber: 1,
      accountCode: receivingAccountCode,
      accountName: { ar: 'النقد / البنك', en: 'Cash / Bank' },
      debit: totalAmount,
      credit: 0,
      description: `استلام دفعة باقة ${bookingRef} — ${customerName}`,
    },
    // CR: إيراد مؤجل — سعر البيع بدون VAT (مؤجَّل حتى تقديم الخدمة)
    {
      lineNumber: 2,
      accountCode: accounts.deferredRevenueAccount,
      accountName: { ar: 'إيراد مؤجل — باقات سياحية', en: 'Deferred Revenue — Packages' },
      debit: 0,
      credit: sellingPriceExclVat,
      description: `إيراد مؤجل — باقة ${bookingRef}`,
    },
  ];

  // CR: VAT Output (قد تكون صفراً للعمرة والحج)
  if (vatAmount > 0) {
    lines.push({
      lineNumber: lines.length + 1,
      accountCode: accounts.vatOutputAccount,
      accountName: { ar: 'ضريبة القيمة المضافة — مخرجات', en: 'VAT Output' },
      debit: 0,
      credit: vatAmount,
      description: `VAT على باقة ${bookingRef}`,
    });
  }

  return lines;
}

// ─── المرحلة 2: الاعتراف بالإيراد وتكلفة المبيعات ───────────────────────────

/**
 * يُولِّد سطور الاعتراف بالإيراد وتسجيل تكلفة المبيعات (نموذج الأصيل).
 *
 * قيد الإيراد:
 *   DR إيراد مؤجل     [sellingPriceExclVat]
 *     CR إيراد الباقات  [sellingPriceExclVat]
 *
 * قيد تكلفة المبيعات (COGS):
 *   DR تكلفة الباقات        [totalCostPrice]
 *     CR ذمم مورد 1          [مبلغ 1]
 *     CR ذمم مورد 2          [مبلغ 2]
 *     ...
 *
 * الموردون مُفصَّلون (فندق مكة + فندق المدينة + شركة نقل...) لوضوح كشف الحساب.
 */
export function buildPrincipalRevenueRecognitionLines(
  input: PrincipalRevenueRecognitionInput,
  config: AgencyAccountingConfig
): JournalLine[] {
  const { accounts } = config;
  const { sellingPriceExclVat, totalCostPrice, supplierBreakdown, bookingRef, bookingType } = input;

  // تحقق: مجموع تفصيل الموردين = إجمالي التكلفة
  const breakdownTotal: Halalas = supplierBreakdown.reduce((s, b) => s + b.amount, 0);
  if (breakdownTotal !== totalCostPrice) {
    throw new Error(
      `عدم تطابق تكاليف الموردين في ${bookingRef}: ` +
      `مجموع التفصيل (${breakdownTotal}) لا يساوي totalCostPrice (${totalCostPrice})`
    );
  }

  const revenueAccountCode = bookingType === 'package'
    ? accounts.packageRevenue
    : accounts.commissionUmrahHajj;

  const costAccountCode = accounts.packageCostAccount;

  const lines: JournalLine[] = [
    // ── قيد الإيراد ──────────────────────────────────────────────────────
    // DR: تحرير الإيراد المؤجل
    {
      lineNumber: 1,
      accountCode: accounts.deferredRevenueAccount,
      accountName: { ar: 'إيراد مؤجل', en: 'Deferred Revenue' },
      debit: sellingPriceExclVat,
      credit: 0,
      description: `تحرير إيراد مؤجل — باقة ${bookingRef}`,
    },
    // CR: إيراد الباقة / العمرة
    {
      lineNumber: 2,
      accountCode: revenueAccountCode,
      accountName: { ar: 'إيراد الباقات السياحية', en: 'Package / Umrah Revenue' },
      debit: 0,
      credit: sellingPriceExclVat,
      description: `اعتراف بإيراد باقة ${bookingRef}`,
    },

    // ── قيد تكلفة المبيعات (COGS) ────────────────────────────────────────
    // DR: تكلفة الباقات
    {
      lineNumber: 3,
      accountCode: costAccountCode,
      accountName: { ar: 'تكلفة الباقات والعمرة', en: 'Cost of Packages' },
      debit: totalCostPrice,
      credit: 0,
      description: `تكلفة مبيعات — باقة ${bookingRef}`,
    },

    // CR: ذمم كل مورد منفصل (لوضوح كشوفات الموردين)
    ...supplierBreakdown.map((supplier, idx) => ({
      lineNumber: idx + 4,
      accountCode: supplier.accountCode,
      accountName: { ar: 'ذمم الموردون', en: 'Supplier Payable' },
      debit: 0,
      credit: supplier.amount,
      description: `${supplier.description} — ${bookingRef}`,
    })),
  ];

  return lines;
}
