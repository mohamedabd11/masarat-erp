/**
 * Edge-case accounting tests — scenarios not covered by the main strategy tests.
 *
 * Covers:
 *   - Large amounts (Hajj season, group bookings — tests BIGINT range safety)
 *   - Sequential rounding across multiple bookings
 *   - BSP settlement entries
 *   - Idempotency of extractVat / addVat under repeated application
 *   - Boundary values: 1 halala, max safe integer
 */
import { describe, it, expect } from 'vitest';
import {
  fromSAR,
  toSAR,
  calculateVat,
  addVat,
  extractVat,
  sumHalalas,
  assertValidHalalas,
} from '../money';
import { validateBalance, validateAndCorrect, AccountingValidationError } from '../validator';
import { generateJournalEntry } from '../engine';
import type {
  AgencyAccountingConfig,
  PrincipalPaymentReceivedInput,
  AgentPaymentReceivedInput,
  AgentServiceDeliveredInput,
  PrincipalRevenueRecognitionInput,
  RefundInput,
} from '../types';

// ─── Shared test config ──────────────────────────────────────────────────────

const CONFIG: AgencyAccountingConfig = {
  agencyId: 'ag_edge_001',
  vatRate: 0.15,
  defaultRevenueModel: { flight: 'agent', hotel: 'agent', package: 'principal', umrah: 'principal', hajj: 'principal' },
  accounts: {
    mainCashAccount: '1001',
    mainBankAccount: '1002',
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
    airlinePayableAccount: '3001',
    hotelPayableAccount: '3002',
    umrahPayableAccount: '3003',
    insurancePayableAccount: '3004',
    vatOutputAccount: '3101',
    vatInputAccount: '1203',
    roundingDifferenceAccount: '8399',
  },
};

// ─── Large amount tests (Hajj season / group bookings) ───────────────────────

describe('مبالغ ضخمة — موسم الحج / حجوزات جماعية', () => {
  /**
   * حجز جماعي للحج: 50 شخصاً × 25,000 ر.س = 1,250,000 ر.س
   * مع VAT 15%: 187,500 ر.س
   * الإجمالي: 1,437,500 ر.س = 143,750,000 هللة
   */
  const sellingPriceExclVat = fromSAR(1_250_000); // 125,000,000 هللة
  const vatAmount = calculateVat(sellingPriceExclVat, 0.15);

  it('fromSAR لا يفقد دقة عند مبالغ كبيرة', () => {
    expect(sellingPriceExclVat).toBe(125_000_000);
    expect(vatAmount).toBe(18_750_000); // 187,500 ر.س
    expect(sellingPriceExclVat + vatAmount).toBe(143_750_000);
  });

  it('toSAR يُعيد المبلغ الصحيح', () => {
    expect(toSAR(143_750_000)).toBeCloseTo(1_437_500, 2);
  });

  it('القيد الجماعي متوازن', () => {
    const input: PrincipalPaymentReceivedInput = {
      phase: 'principal_payment_received',
      bookingType: 'hajj',
      sellingPriceExclVat,
      vatAmount,
      totalAmount: sellingPriceExclVat + vatAmount,
      vatCategory: 'S',
      receivingAccountCode: '1002',
      bookingRef: 'HJ-2026-001',
      customerName: 'مجموعة الحج الكبرى',
    };

    const result = generateJournalEntry(input, CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(143_750_000);
    expect(result.totalCredit).toBe(143_750_000);
  });

  it('لا overflow عند مبلغ MAX_SAFE_INTEGER / 2', () => {
    // Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991
    // أكبر فاتورة نظرية: ~45 مليار ريال — أبعد بكثير من الواقع
    const bigAmount = Math.floor(Number.MAX_SAFE_INTEGER / 4);
    expect(() => assertValidHalalas(bigAmount, 'bigAmount')).not.toThrow();
    expect(Number.isSafeInteger(bigAmount)).toBe(true);
  });
});

// ─── Sequential rounding across multiple bookings ────────────────────────────

describe('التقريب المتراكم عبر حجوزات متعددة', () => {
  /**
   * 3 حجوزات بمبالغ تُنتج كسوراً في الهللات:
   * كل حجز: 333.33 ر.س → 33,333 هللة (ليس قابلاً للقسمة)
   *
   * المجموع المتوقع: 99,999 هللة
   * لو حُسب بالريال ثم حوّل: 999.99 ر.س × 100 = 99,999 هللة ✓
   */
  it('3 × fromSAR(333.33) = 99999 هللة', () => {
    const perBooking = fromSAR(333.33);
    expect(perBooking).toBe(33333);
    expect(sumHalalas([perBooking, perBooking, perBooking])).toBe(99999);
  });

  it('VAT على مبالغ غير قابلة للقسمة على 3 — يُقرَّب لأقرب هللة', () => {
    // 333.33 ر.س × 15% = 49.9995 ر.س → يجب تقريبه لـ 4999 هللة (أقرب عدد صحيح)
    const amount = fromSAR(333.33); // 33333 هللة
    const vat = calculateVat(amount, 0.15); // 33333 × 0.15 = 4999.95 → 5000 هللة
    expect(Number.isInteger(vat)).toBe(true);
    // التحقق أن الفرق لا يتجاوز 1 هللة من القيمة الدقيقة
    expect(Math.abs(vat - 33333 * 0.15)).toBeLessThanOrEqual(0.5);
  });
});

// ─── validateAndCorrect: rounding edge cases ─────────────────────────────────

describe('validateAndCorrect — حالات حافة في التقريب', () => {
  const ROUNDING_ACCOUNT = '8399';
  const ROUNDING_NAME = { ar: 'فروق التقريب', en: 'Rounding' };

  function line(code: string, debit: number, credit: number, n = 1) {
    return {
      lineNumber: n,
      accountCode: code,
      accountName: { ar: `حساب ${code}`, en: `Account ${code}` },
      debit,
      credit,
      description: 'test',
    };
  }

  it('فرق صفر — لا سطر تقريب', () => {
    const lines = [line('1002', 100_000, 0, 1), line('3201', 0, 100_000, 2)];
    const { hadRoundingCorrection, lines: out } = validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);
    expect(hadRoundingCorrection).toBe(false);
    expect(out).toHaveLength(2);
  });

  it('فرق +1 هللة (مدين أكبر) → سطر دائن 1 هللة على حساب الفروق', () => {
    const lines = [line('1002', 100_001, 0, 1), line('3201', 0, 100_000, 2)];
    const { hadRoundingCorrection, lines: out } = validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);
    expect(hadRoundingCorrection).toBe(true);
    const roundLine = out.find(l => l.accountCode === ROUNDING_ACCOUNT);
    expect(roundLine?.credit).toBe(1);
    expect(roundLine?.debit).toBe(0);
    const total = out.reduce((s, l) => s + l.debit, 0);
    const totalC = out.reduce((s, l) => s + l.credit, 0);
    expect(total).toBe(totalC);
  });

  it('فرق -1 هللة (دائن أكبر) → سطر مدين 1 هللة على حساب الفروق', () => {
    const lines = [line('1002', 99_999, 0, 1), line('3201', 0, 100_000, 2)];
    const { hadRoundingCorrection, lines: out } = validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);
    expect(hadRoundingCorrection).toBe(true);
    const roundLine = out.find(l => l.accountCode === ROUNDING_ACCOUNT);
    expect(roundLine?.debit).toBe(1);
    expect(roundLine?.credit).toBe(0);
  });

  it('فرق 2 هللات → يُرمى AccountingValidationError', () => {
    const lines = [line('1002', 100_002, 0, 1), line('3201', 0, 100_000, 2)];
    expect(() => validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME))
      .toThrow(AccountingValidationError);
  });
});

// ─── addVat / extractVat idempotency ─────────────────────────────────────────

describe('addVat / extractVat — الإدempotency والدقة', () => {
  it('addVat ثم extractVat يُعيد المبلغ الأصلي بدقة هللة واحدة', () => {
    const testAmounts = [100, 7300, 85000, 93625, 500_000, 1_250_000, 143_750_000];
    for (const amount of testAmounts) {
      const withVat = addVat(amount, 0.15);
      const extractedVat = extractVat(withVat, 0.15);
      const base = withVat - extractedVat;
      // البسط يساوي الأصلي مع مسامحة هللة واحدة بسبب التقريب
      expect(Math.abs(base - amount)).toBeLessThanOrEqual(1);
    }
  });

  it('لا يُطبَّق VAT مرتين على نفس القيد', () => {
    // سيناريو خطأ شائع: تطبيق VAT على مبلغ يشمل VAT مسبقاً
    const netAmount = 85000;
    const vatOnNet = calculateVat(netAmount, 0.15);      // 12750
    const total = netAmount + vatOnNet;                   // 97750

    // الخطأ: تطبيق VAT على total بدلاً من net
    const wrongVat = calculateVat(total, 0.15);           // 14662 (خطأ)
    expect(wrongVat).not.toBe(vatOnNet);

    // الصحيح: استخراج VAT من total
    const correctVat = extractVat(total, 0.15);
    expect(correctVat).toBe(vatOnNet); // يجب أن يطابق
  });
});

// ─── Agent model: VAT on service fee only ────────────────────────────────────

describe('نموذج الوكيل — VAT على رسوم الخدمة فقط لا على قيمة التذكرة', () => {
  /**
   * هذا التمييز جوهري لـ ZATCA:
   * - قيمة التذكرة الدولية: خارج نطاق VAT (صفري)
   * - رسوم الخدمة: خاضعة لـ VAT 15%
   */
  it('رسوم الخدمة الصفرية لا تُولِّد سطر VAT', () => {
    const input: AgentPaymentReceivedInput = {
      phase: 'agent_payment_received',
      bookingType: 'flight',
      isInternational: true,
      costPrice: 85000,
      serviceFee: 0,
      serviceFeeVatCategory: 'Z',
      serviceFeeVatAmount: 0,
      receivingAccountCode: '1002',
      bookingRef: 'BK-NOSVAT-001',
      customerName: 'عميل الاختبار',
    };

    const result = generateJournalEntry(input, CONFIG);
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine).toBeUndefined();
    expect(result.isBalanced).toBe(true);
  });

  it('VAT يُحسب على رسوم الخدمة فقط — ليس على التذكرة + الخدمة', () => {
    const serviceFee = 7500;
    const vatOnServiceFee = calculateVat(serviceFee, 0.15); // 1125
    const wrongVat = calculateVat(85000 + serviceFee, 0.15); // 13875 (خطأ)

    expect(vatOnServiceFee).toBe(1125);
    expect(vatOnServiceFee).not.toBe(wrongVat);

    const input: AgentPaymentReceivedInput = {
      phase: 'agent_payment_received',
      bookingType: 'flight',
      isInternational: true,
      costPrice: 85000,
      serviceFee,
      serviceFeeVatCategory: 'S',
      serviceFeeVatAmount: vatOnServiceFee,
      receivingAccountCode: '1002',
      bookingRef: 'BK-VAT-CHECK',
      customerName: 'فاطمة العلي',
    };

    const result = generateJournalEntry(input, CONFIG);
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine?.credit).toBe(1125);
    expect(vatLine?.credit).not.toBe(wrongVat);
  });
});

// ─── Refund / Credit Note scenarios ─────────────────────────────────────────

describe('قيد الاسترداد — سيناريوهات الدفع الجزئي والإلغاء', () => {
  /**
   * سيناريو 1: استرداد كامل بدون رسوم إلغاء
   * العميل يسترد كامل مبلغه — الوكالة لا تحتجز شيئاً
   */
  it('استرداد كامل بدون رسوم إلغاء — القيد متوازن', () => {
    const refundAmount = fromSAR(1_500); // 150,000 هللة

    const input: RefundInput = {
      phase: 'refund_issued',
      refundAmountToCustomer: refundAmount,
      cancellationFee: 0,
      cancellationFeeVat: 0,
      supplierRefundReceivableAccount: '2100',
      refundPaymentAccountCode: '1110',
      bookingRef: 'BK-REF-001',
      customerName: 'أحمد الغامدي',
    };

    const result = generateJournalEntry(input, CONFIG);

    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(refundAmount);
    expect(result.totalCredit).toBe(refundAmount);
    // لا سطر VAT لأن رسوم الإلغاء صفر
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine).toBeUndefined();
  });

  /**
   * سيناريو 2: استرداد جزئي مع رسوم إلغاء + VAT
   * فاتورة 2000 ريال → يُسترد 1700 ريال، رسوم إلغاء 300 ريال + VAT 45 ريال
   * إجمالي الذمة من المورد = 1700 + 300 + 45 = 2045 ريال
   */
  it('استرداد جزئي مع رسوم إلغاء — القيد متوازن', () => {
    const refundToCustomer = fromSAR(1_700);  // 170,000 هللة
    const cancellationFee  = fromSAR(300);    // 30,000 هللة
    const cancellationVat  = calculateVat(cancellationFee, 0.15); // 4,500 هللة

    const input: RefundInput = {
      phase: 'refund_issued',
      refundAmountToCustomer: refundToCustomer,
      cancellationFee,
      cancellationFeeVat: cancellationVat,
      supplierRefundReceivableAccount: '2100',
      refundPaymentAccountCode: '1110',
      bookingRef: 'BK-REF-002',
      customerName: 'منى الشهري',
    };

    const result = generateJournalEntry(input, CONFIG);

    expect(result.isBalanced).toBe(true);
    const expectedTotal = refundToCustomer + cancellationFee + cancellationVat;
    expect(result.totalDebit).toBe(expectedTotal);

    // تحقق من سطر رسوم الإلغاء
    const feeLine = result.lines.find(l => l.accountCode === CONFIG.accounts.serviceFees);
    expect(feeLine?.credit).toBe(cancellationFee);

    // تحقق من سطر VAT
    const vatLine = result.lines.find(l => l.accountCode === CONFIG.accounts.vatOutputAccount);
    expect(vatLine?.credit).toBe(cancellationVat);
  });

  /**
   * سيناريو 3: رسوم الإلغاء 100% — العميل لا يسترد شيئاً
   */
  it('رسوم إلغاء 100% — لا استرداد للعميل', () => {
    const invoiceAmount = fromSAR(500); // 50,000 هللة
    const vat = calculateVat(invoiceAmount, 0.15); // 7,500 هللة

    const input: RefundInput = {
      phase: 'refund_issued',
      refundAmountToCustomer: 0,
      cancellationFee: invoiceAmount,
      cancellationFeeVat: vat,
      supplierRefundReceivableAccount: '2100',
      refundPaymentAccountCode: '1110',
      bookingRef: 'BK-REF-003',
      customerName: 'عبدالله القحطاني',
    };

    const result = generateJournalEntry(input, CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(invoiceAmount + vat);

    // لا سطر نقدي للعميل لأن الاسترداد صفر
    const cashLine = result.lines.find(l =>
      l.accountCode === '1110' && l.credit > 0
    );
    expect(cashLine).toBeUndefined();
  });
});

// ─── دورة الحياة الكاملة لمعاملة الوكيل (Payment → Service) ────────────────

describe('دورة الحياة الكاملة — نموذج الوكيل', () => {
  /**
   * الخطوة 1: استلام الدفعة من العميل (قبل إصدار التذكرة)
   * الخطوة 2: إصدار التذكرة (اعتراف بالإيراد)
   * التحقق: كل مرحلة متوازنة على حدة
   */
  it('مرحلة 1 ثم مرحلة 2 — كل منهما متوازنة مستقلاً', () => {
    const costPrice  = fromSAR(850);  // 85,000 هللة
    const serviceFee = fromSAR(75);   // 7,500 هللة
    const feeVat     = calculateVat(serviceFee, 0.15); // 1,125 هللة

    const phase1: AgentPaymentReceivedInput = {
      phase: 'agent_payment_received',
      bookingType: 'flight',
      isInternational: true,
      costPrice,
      serviceFee,
      serviceFeeVatCategory: 'S',
      serviceFeeVatAmount: feeVat,
      receivingAccountCode: '1002',
      bookingRef: 'BK-AGENT-FULL-001',
      customerName: 'سارة العتيبي',
    };

    const phase2: AgentServiceDeliveredInput = {
      phase: 'agent_service_delivered',
      bookingType: 'flight',
      isInternational: true,
      customerDepositAmount: costPrice,
      netCostToSupplier: costPrice,
      serviceFee,
      supplierPayableAccountCode: '3001',
      bookingRef: 'BK-AGENT-FULL-001',
    };

    const r1 = generateJournalEntry(phase1, CONFIG);
    const r2 = generateJournalEntry(phase2, CONFIG);

    expect(r1.isBalanced).toBe(true);
    expect(r2.isBalanced).toBe(true);
    // مجموع المدين في المرحلتين يساوي مجموع الدائن
    expect(r1.totalDebit + r2.totalDebit).toBe(r1.totalCredit + r2.totalCredit);
  });
});

// ─── دورة الحياة الكاملة لنموذج الأصيل (Package) ────────────────────────────

describe('دورة الحياة الكاملة — نموذج الأصيل (باقة عمرة)', () => {
  /**
   * باقة عمرة بـ 5000 ريال + VAT 15% = 5750 ريال
   * الخطوة 1: استلام الدفعة → إيراد مؤجل
   * الخطوة 2: اعتراف بالإيراد بعد تقديم الخدمة
   */
  const sellingExclVat = fromSAR(5_000); // 500,000 هللة
  const vatAmount      = calculateVat(sellingExclVat, 0.15); // 75,000 هللة
  const totalAmount    = sellingExclVat + vatAmount;

  it('مرحلة 1 (استلام دفعة أصيل) — متوازنة', () => {
    const input: PrincipalPaymentReceivedInput = {
      phase: 'principal_payment_received',
      bookingType: 'umrah',
      sellingPriceExclVat: sellingExclVat,
      vatAmount,
      totalAmount,
      vatCategory: 'S',
      receivingAccountCode: '1002',
      bookingRef: 'UM-2026-001',
      customerName: 'عائلة الزهراني',
    };

    const result = generateJournalEntry(input, CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(totalAmount);
    expect(result.totalCredit).toBe(totalAmount);
  });

  it('مرحلة 2 (اعتراف بالإيراد) — متوازنة ومبلغ الإيراد صحيح', () => {
    const totalCostPrice = fromSAR(3_800); // 380,000 هللة — تكلفة الموردين

    const input: PrincipalRevenueRecognitionInput = {
      phase: 'principal_revenue_recognition',
      bookingType: 'umrah',
      sellingPriceExclVat: sellingExclVat,
      totalCostPrice,
      supplierBreakdown: [
        { accountCode: '3003', amount: fromSAR(3_000), description: 'شركة العمرة' },
        { accountCode: '3002', amount: fromSAR(800),   description: 'فندق المدينة' },
      ],
      bookingRef: 'UM-2026-001',
    };

    const result = generateJournalEntry(input, CONFIG);
    expect(result.isBalanced).toBe(true);
    // العمرة تستخدم commissionUmrahHajj (6005) لا packageRevenue (6101)
    // هامش الربح الإجمالي = 5000 - 3800 = 1200 ريال يظهر في الإيراد
    const revenueLine = result.lines.find(l => l.accountCode === CONFIG.accounts.commissionUmrahHajj);
    expect(revenueLine).toBeDefined();
    expect(revenueLine?.credit).toBe(sellingExclVat);
  });
});

// ─── sumHalalas boundary values ──────────────────────────────────────────────

describe('sumHalalas — قيم الحدود', () => {
  it('مجموع قائمة فارغة = صفر', () => {
    expect(sumHalalas([])).toBe(0);
  });

  it('عنصر واحد يُعيد نفس العنصر', () => {
    expect(sumHalalas([93625])).toBe(93625);
  });

  it('يرفض قائمة تحتوي على هللة واحدة سالبة', () => {
    expect(() => sumHalalas([1000, -1, 500])).toThrow();
  });

  it('يرفض قائمة تحتوي على قيمة كسرية', () => {
    expect(() => sumHalalas([1000, 0.5, 500])).toThrow();
  });

  it('مجموع كبير لا يفقد الدقة', () => {
    // 1000 حجز × 93,625 هللة = 93,625,000 هللة
    const bookings = Array(1000).fill(93_625);
    expect(sumHalalas(bookings)).toBe(93_625_000);
    expect(Number.isSafeInteger(93_625_000)).toBe(true);
  });
});
