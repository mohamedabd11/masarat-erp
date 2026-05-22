/**
 * @masarat/accounting — Types
 *
 * قاعدة التصميم: كل مبلغ مالي يُخزَّن بالهللات (أعداد صحيحة).
 * 1 ريال سعودي = 100 هللة. لا يوجد float في أي حساب مالي.
 */

/** وحدة المبالغ المالية: هللات (عدد صحيح دائماً) */
export type Halalas = number;

/** نموذج الإيراد وفق IFRS 15 */
export type RevenueModel = 'agent' | 'principal';

/**
 * تصنيفات ضريبة القيمة المضافة وفق ZATCA
 * S = خاضع للضريبة 15%
 * Z = صفري (نقل دولي، خدمات مُصدَّرة)
 * E = معفى (خدمات دينية)
 * O = خارج نطاق الضريبة
 */
export type VatCategory = 'S' | 'Z' | 'E' | 'O';

/** أنواع الحجوزات */
export type BookingType =
  | 'flight'
  | 'hotel'
  | 'package'
  | 'umrah'
  | 'hajj'
  | 'insurance'
  | 'visa'
  | 'transport';

/** أنواع القيود اليومية */
export type JournalEntryType =
  | 'payment_received'
  | 'ticket_issued'
  | 'package_revenue_recognized'
  | 'refund_payment'
  | 'manual_adjustment';

// ─── بنية سطر القيد اليومي ───────────────────────────────────────────────────

/**
 * سطر واحد في القيد اليومي.
 * القاعدة: إما debit > 0 و credit === 0، أو العكس. لا الاثنان معاً.
 */
export interface JournalLine {
  lineNumber: number;
  accountCode: string;
  accountName: { ar: string; en: string };
  /** المبلغ المدين بالهللات. 0 إذا كان السطر دائناً */
  debit: Halalas;
  /** المبلغ الدائن بالهللات. 0 إذا كان السطر مديناً */
  credit: Halalas;
  description: string;
  costCenter?: string;
}

// ─── خريطة الحسابات ──────────────────────────────────────────────────────────

/**
 * خريطة الحسابات المحاسبية.
 * تُضبط مرة واحدة لكل وكالة وتُستخدم في توليد القيود.
 * أرقام الحسابات الافتراضية موثقة في DATABASE-Schema-and-Security-Rules.md
 */
export interface AccountMapping {
  // النقد والبنوك
  mainCashAccount: string;          // 1001
  mainBankAccount: string;          // 1002
  bspClearingAccount: string;       // 1004

  // مطلوبات تجاه العملاء
  customerDepositsAccount: string;  // 3202 — أمانات (قبل تقديم الخدمة)
  deferredRevenueAccount: string;   // 3201 — إيراد مؤجل

  // إيرادات العمولات والخدمات
  commissionFlightDomestic: string;      // 6001
  commissionFlightInternational: string; // 6002
  commissionHotelDomestic: string;       // 6003
  commissionHotelInternational: string;  // 6004
  commissionUmrahHajj: string;           // 6005
  commissionInsurance: string;           // 6006
  serviceFees: string;                   // 6007 — رسوم الخدمة ورسوم الإلغاء
  packageRevenue: string;                // 6101

  // تكلفة الخدمات (نموذج الأصيل فقط)
  flightCostAccount: string;    // 7001
  hotelCostAccount: string;     // 7002
  packageCostAccount: string;   // 7003

  // ذمم الموردين
  airlinePayableAccount: string;    // 3001
  hotelPayableAccount: string;      // 3002
  umrahPayableAccount: string;      // 3003
  insurancePayableAccount: string;  // 3004

  // الضرائب
  vatOutputAccount: string;  // 3101
  vatInputAccount: string;   // 1203

  // فروق التقريب (يُستخدم لتعديل فرق 1 هللة)
  roundingDifferenceAccount: string; // 8399
}

/** إعدادات المحاسبة للوكالة */
export interface AgencyAccountingConfig {
  agencyId: string;
  accounts: AccountMapping;
  /** معدل VAT الافتراضي (0.15 = 15%) */
  vatRate: number;
  /** نموذج الإيراد الافتراضي لكل نوع حجز */
  defaultRevenueModel: Partial<Record<BookingType, RevenueModel>>;
}

// ─── مدخلات المعاملات ─────────────────────────────────────────────────────────

/**
 * مرحلة 1 من نموذج الوكيل: استلام الدفعة.
 *
 * يُولَّد عند: استلام مبلغ من العميل قبل إصدار التذكرة/الخدمة.
 * النتيجة: المبلغ الكامل في الميزانية العمومية كمطلوبات، الإيراد مؤجَّل.
 */
export interface AgentPaymentReceivedInput {
  phase: 'agent_payment_received';
  bookingType: BookingType;
  isInternational: boolean;

  /** تكلفة الخدمة التي ستُحوَّل لأمانة عميل — بالهللات */
  costPrice: Halalas;
  /** رسوم الخدمة (الربح المباشر للوكالة) — بالهللات */
  serviceFee: Halalas;
  /** تصنيف VAT على رسوم الخدمة */
  serviceFeeVatCategory: VatCategory;
  /**
   * مبلغ VAT على رسوم الخدمة — بالهللات.
   * يجب حسابه باستخدام money.calculateVat() قبل التمرير.
   */
  serviceFeeVatAmount: Halalas;

  /** كود حساب البنك أو الصندوق الذي استُلمت فيه الدفعة */
  receivingAccountCode: string;

  bookingRef: string;
  customerName: string;
}

/**
 * مرحلة 2 من نموذج الوكيل: تقديم الخدمة (إصدار التذكرة).
 *
 * يُولَّد عند: إصدار التذكرة أو تأكيد الخدمة.
 * النتيجة: تحرير الأمانة، إثبات مطلوب المورد، اعتراف بالإيراد.
 */
export interface AgentServiceDeliveredInput {
  phase: 'agent_service_delivered';
  bookingType: BookingType;
  isInternational: boolean;

  /** مبلغ الأمانة المحجوزة في مرحلة 1 (يُحرَّر الآن) — بالهللات */
  customerDepositAmount: Halalas;
  /** المبلغ الفعلي المستحق للمورد — بالهللات */
  netCostToSupplier: Halalas;
  /** رسوم الخدمة المؤجلة التي تُعترف بها الآن — بالهللات */
  serviceFee: Halalas;

  /** كود حساب ذمة المورد المعني */
  supplierPayableAccountCode: string;

  bookingRef: string;
}

/**
 * مرحلة 1 من نموذج الأصيل: استلام دفعة الباقة.
 *
 * يُولَّد عند: استلام مبلغ من العميل مقابل باقة/عمرة/حج.
 * الوكالة أصيل: VAT محسوب على كامل سعر البيع.
 */
export interface PrincipalPaymentReceivedInput {
  phase: 'principal_payment_received';
  bookingType: Extract<BookingType, 'package' | 'umrah' | 'hajj'>;

  /** سعر البيع بدون VAT — بالهللات */
  sellingPriceExclVat: Halalas;
  /** مبلغ VAT المحسوب — بالهللات */
  vatAmount: Halalas;
  /** = sellingPriceExclVat + vatAmount (يُتحقق منه في الـ validator) */
  totalAmount: Halalas;
  /** تصنيف VAT (عادةً S=15% للباقات المحلية، E للعمرة) */
  vatCategory: VatCategory;

  receivingAccountCode: string;
  bookingRef: string;
  customerName: string;
}

/**
 * مرحلة 2 من نموذج الأصيل: الاعتراف بالإيراد عند تقديم الخدمة.
 *
 * يُولَّد عند: انتهاء الرحلة أو تأكيد تقديم الباقة.
 * يُنشئ قيدَين: اعتراف بالإيراد + تكلفة المبيعات.
 */
export interface PrincipalRevenueRecognitionInput {
  phase: 'principal_revenue_recognition';
  bookingType: Extract<BookingType, 'package' | 'umrah' | 'hajj'>;

  /** سعر البيع المؤجل الذي يُعترف به الآن — بالهللات */
  sellingPriceExclVat: Halalas;
  /** إجمالي تكلفة المشتريات من الموردين — بالهللات */
  totalCostPrice: Halalas;

  /** تفصيل الموردين ومبالغهم (يجب أن يجمع لـ totalCostPrice) */
  supplierBreakdown: Array<{
    accountCode: string;
    amount: Halalas;
    description: string;
  }>;

  bookingRef: string;
}

/**
 * قيد الاسترداد: إعادة مبلغ للعميل مع رسوم الإلغاء.
 *
 * يُولَّد عند: إلغاء حجز مع إعادة جزء أو كل المبلغ.
 */
export interface RefundInput {
  phase: 'refund_issued';

  /** المبلغ الذي يُعاد للعميل فعلاً — بالهللات */
  refundAmountToCustomer: Halalas;
  /** رسوم الإلغاء التي تحتفظ بها الوكالة — بالهللات */
  cancellationFee: Halalas;
  /** VAT على رسوم الإلغاء — بالهللات */
  cancellationFeeVat: Halalas;

  /** الحساب المستحق من المورد (سيُسجَّل في الذمم المدينة) */
  supplierRefundReceivableAccount: string;
  /** حساب البنك/الصندوق الذي سيُخصَّم منه الاسترداد للعميل */
  refundPaymentAccountCode: string;

  bookingRef: string;
  customerName: string;
}

/** الاتحاد الشامل لجميع أنواع مدخلات المعاملات */
export type TransactionInput =
  | AgentPaymentReceivedInput
  | AgentServiceDeliveredInput
  | PrincipalPaymentReceivedInput
  | PrincipalRevenueRecognitionInput
  | RefundInput;

// ─── مخرجات المحرك ───────────────────────────────────────────────────────────

/** نتيجة توليد القيد اليومي */
export interface JournalEntryResult {
  type: JournalEntryType;
  description: string;
  lines: JournalLine[];
  totalDebit: Halalas;
  totalCredit: Halalas;
  /** دائماً true بعد اجتياز الـ validator — وإلا كان المحرك رمى خطأ */
  isBalanced: true;
  metadata: {
    revenueModel: RevenueModel;
    bookingType: BookingType;
    isInternational?: boolean;
    generatedAt: Date;
    /** هل أُضيف سطر تعديل تقريب (1 هللة)؟ */
    hadRoundingCorrection: boolean;
  };
}

/** نتيجة الـ validator قبل الـ commit */
export interface ValidationResult {
  isValid: boolean;
  totalDebit: Halalas;
  totalCredit: Halalas;
  /**양수 = debit أكبر، سالب = credit أكبر */
  difference: Halalas;
  errors: string[];
}
