/**
 * @masarat/zatca — Types
 * أنواع بيانات الفاتورة الإلكترونية وفق متطلبات ZATCA المرحلة الثانية
 */

export type ZatcaInvoiceTypeCode = '388' | '381' | '383';
// 388 = فاتورة ضريبية / 381 = إشعار دائن / 383 = إشعار مدين

export type ZatcaVatCategory = 'S' | 'Z' | 'E' | 'O';

export type ZatcaTransactionType = 'B2B' | 'B2C';

/** سبب الإعفاء وفق ZATCA */
export type ZatcaExemptionReason =
  | 'VATEX-SA-29'    // الخدمات المالية
  | 'VATEX-SA-29-7'  // التأمين
  | 'VATEX-SA-30'    // المعادن الثمينة
  | 'VATEX-SA-32'    // النقل الدولي للركاب
  | 'VATEX-SA-33'    // الصادرات خارج دول الخليج
  | 'VATEX-SA-34-1'  // العمرة والحج
  | 'VATEX-SA-34-2'  // المركبات والطائرات
  | 'VATEX-SA-EDU-DTT' // التعليم
  | 'VATEX-SA-HEA-DTT' // الرعاية الصحية
  | null;

// ─── بيانات البائع ────────────────────────────────────────────────────────────

export interface ZatcaAddress {
  buildingNumber: string;
  streetName: string;
  district: string;
  city: string;
  postalCode: string;
  additionalNumber?: string;
  countryCode: 'SA';
}

export interface ZatcaSeller {
  nameAr: string;
  nameEn: string;
  vatNumber: string;       // 15 خانة تبدأ بـ 300
  crNumber: string;
  address: ZatcaAddress;
}

// ─── بيانات المشتري ───────────────────────────────────────────────────────────

export interface ZatcaBuyer {
  name: string;
  vatNumber?: string;       // إلزامي في B2B
  address?: Partial<ZatcaAddress>;
}

// ─── بنود الفاتورة ────────────────────────────────────────────────────────────

export interface ZatcaInvoiceLine {
  id: string;
  name: string;                 // وصف البند
  quantity: number;
  unitCode: 'PCE';              // وحدة القياس
  unitPriceExclVat: number;     // سعر الوحدة بدون VAT (بالهللات)
  totalPriceExclVat: number;    // الإجمالي بدون VAT (بالهللات)
  vatCategory: ZatcaVatCategory;
  vatRate: number;              // 0.15 أو 0
  vatAmount: number;            // مبلغ الضريبة (بالهللات)
  exemptionReason?: ZatcaExemptionReason;
  discount?: number;            // خصم (بالهللات)
}

// ─── إجماليات الفاتورة ────────────────────────────────────────────────────────

export interface ZatcaTotals {
  /** إجمالي بدون VAT (بالهللات) */
  subtotalExclVat: number;
  /** إجمالي VAT (بالهللات) */
  totalVat: number;
  /** الإجمالي شامل VAT (بالهللات) */
  grandTotal: number;
  /** تفصيل VAT حسب التصنيف */
  vatBreakdown: Array<{
    category: ZatcaVatCategory;
    taxableAmount: number;
    vatAmount: number;
    exemptionReason?: ZatcaExemptionReason;
  }>;
}

// ─── الفاتورة الكاملة ─────────────────────────────────────────────────────────

export interface ZatcaInvoice {
  /** UUID v4 فريد لكل فاتورة — إلزامي */
  uuid: string;
  invoiceNumber: string;
  invoiceTypeCode: ZatcaInvoiceTypeCode;
  /** نوع الفاتورة: B2B أو B2C */
  transactionType: ZatcaTransactionType;
  issueDateTime: Date;
  currency: 'SAR';
  seller: ZatcaSeller;
  buyer: ZatcaBuyer;
  lines: ZatcaInvoiceLine[];
  totals: ZatcaTotals;
  /** للإشعارات: UUID الفاتورة الأصل */
  originalInvoiceUUID?: string;
  /** للإشعارات: رقم الفاتورة الأصل (يظهر في BillingReference) */
  originalInvoiceNumber?: string;
  /** للإشعارات: hash الفاتورة الأصل */
  originalInvoiceHash?: string;
  /** Hash الفاتورة السابقة في السلسلة (للتسلسل) */
  previousInvoiceHash?: string;
}

// ─── نتيجة توقيع الفاتورة ────────────────────────────────────────────────────

export interface ZatcaSignedInvoice {
  invoice: ZatcaInvoice;
  xmlString: string;
  invoiceHash: string;           // SHA-256 بصيغة Base64
  digitalSignature: string;      // ECDSA بصيغة Base64
  qrCodeData: string;            // TLV بصيغة Base64 (للرسم في الـ UI)
  certificateSerial: string;
}
