import { describe, it, expect } from 'vitest';
import { generateJournalEntry } from '../engine';
import { calculateVat } from '../money';
import { AccountingValidationError } from '../validator';
import type {
  AgencyAccountingConfig,
  PrincipalPaymentReceivedInput,
  PrincipalRevenueRecognitionInput,
  RefundInput,
} from '../types';

// ─── إعدادات وكالة الاختبار ──────────────────────────────────────────────────

const TEST_CONFIG: AgencyAccountingConfig = {
  agencyId: 'ag_test_001',
  vatRate: 0.15,
  defaultRevenueModel: { package: 'principal', umrah: 'principal' },
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

// ─── السيناريو 1: باقة سياحية محلية — المرحلة 1 (استلام الدفعة) ─────────────

describe('نموذج الأصيل — باقة سياحية — المرحلة 1: استلام الدفعة', () => {
  /**
   * باقة سياحية — أبوظبي 5 ليالٍ
   * سعر البيع: 5,000 ر.س (500,000 هللة)
   * VAT 15%: 750 ر.س (75,000 هللة)
   * الإجمالي: 5,750 ر.س (575,000 هللة)
   */
  const sellingPriceExclVat = 500000; // 5000 ر.س
  const vatAmount = calculateVat(sellingPriceExclVat, 0.15); // 75000 هللة

  const input: PrincipalPaymentReceivedInput = {
    phase: 'principal_payment_received',
    bookingType: 'package',
    sellingPriceExclVat,
    vatAmount,
    totalAmount: sellingPriceExclVat + vatAmount,
    vatCategory: 'S',
    receivingAccountCode: '1002',
    bookingRef: 'BK-2026-100',
    customerName: 'شركة ألفا للسياحة',
  };

  it('القيد متوازن', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(575000);
    expect(result.totalCredit).toBe(575000);
  });

  it('البنك مدين بالإجمالي شامل VAT', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const bankLine = result.lines.find(l => l.accountCode === '1002');
    expect(bankLine!.debit).toBe(575000); // 5750 ر.س
  });

  it('الإيراد المؤجل = سعر البيع بدون VAT', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const deferredLine = result.lines.find(l => l.accountCode === '3201');
    expect(deferredLine!.credit).toBe(500000); // 5000 ر.س
  });

  it('VAT Output = 15% من كامل سعر البيع (لا من العمولة فقط)', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine!.credit).toBe(75000); // 750 ر.س = 5000 × 15%
    // مقارنة: في نموذج الوكيل كانت ستكون 11.25 ر.س فقط على رسوم الخدمة
  });

  it('يرفض إذا كان totalAmount لا يساوي sellingPrice + vat', () => {
    const badInput: PrincipalPaymentReceivedInput = {
      ...input,
      totalAmount: 600000, // خطأ متعمد
    };
    expect(() => generateJournalEntry(badInput, TEST_CONFIG)).toThrow(/عدم تطابق/);
  });
});

// ─── السيناريو 2: باقة سياحية — المرحلة 2 (الاعتراف بالإيراد) ───────────────

describe('نموذج الأصيل — باقة سياحية — المرحلة 2: الاعتراف بالإيراد', () => {
  /**
   * بعد تقديم الباقة:
   * سعر البيع (بدون VAT): 5,000 ر.س (500,000 هللة)
   * التكلفة الإجمالية: 3,500 ر.س (350,000 هللة)
   *   - فندق أبوظبي: 2,000 ر.س (200,000 هللة)
   *   - شركة نقل: 800 ر.س (80,000 هللة)
   *   - جولات سياحية: 700 ر.س (70,000 هللة)
   */
  const input: PrincipalRevenueRecognitionInput = {
    phase: 'principal_revenue_recognition',
    bookingType: 'package',
    sellingPriceExclVat: 500000,
    totalCostPrice: 350000,
    supplierBreakdown: [
      { accountCode: '3002', amount: 200000, description: 'فندق ياس أبوظبي' },
      { accountCode: '3002', amount: 80000,  description: 'شركة النقل الذهبي' },
      { accountCode: '3002', amount: 70000,  description: 'جولات سياحية' },
    ],
    bookingRef: 'BK-2026-100',
  };

  it('القيد متوازن', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(result.totalCredit);
  });

  it('تحرير الإيراد المؤجل كاملاً', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const deferredLine = result.lines.find(
      l => l.accountCode === '3201' && l.debit > 0
    );
    expect(deferredLine!.debit).toBe(500000);
  });

  it('اعتراف بإيراد الباقة كاملاً', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const revLine = result.lines.find(l => l.accountCode === '6101');
    expect(revLine!.credit).toBe(500000);
  });

  it('تسجيل تكلفة المبيعات', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const cogsLine = result.lines.find(l => l.accountCode === '7003');
    expect(cogsLine!.debit).toBe(350000); // إجمالي التكلفة
  });

  it('تفصيل ذمم الموردين بشكل منفصل', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const supplierLines = result.lines.filter(
      l => l.accountCode === '3002' && l.credit > 0
    );
    expect(supplierLines).toHaveLength(3);
    const totalSupplier = supplierLines.reduce((s, l) => s + l.credit, 0);
    expect(totalSupplier).toBe(350000);
  });

  it('هامش الربح الإجمالي محسوب ضمنياً: 5000 - 3500 = 1500 ر.س', () => {
    // هامش الربح ليس سطراً في القيد — يظهر في قائمة الدخل:
    // Revenue: 500,000 هللة
    // COGS:    350,000 هللة
    // Gross Profit: 150,000 هللة = 1500 ر.س
    const result = generateJournalEntry(input, TEST_CONFIG);
    const revenue = result.lines.find(l => l.accountCode === '6101')!.credit;
    const cogs = result.lines.find(l => l.accountCode === '7003')!.debit;
    expect(revenue - cogs).toBe(150000); // 1500 ر.س هامش ربح
  });

  it('يرفض إذا كان مجموع تفصيل الموردين لا يساوي totalCostPrice', () => {
    const badInput: PrincipalRevenueRecognitionInput = {
      ...input,
      supplierBreakdown: [
        { accountCode: '3002', amount: 200000, description: 'فندق' },
        { accountCode: '3002', amount: 100000, description: 'نقل' },
        // 300000 بدلاً من 350000
      ],
    };
    expect(() => generateJournalEntry(badInput, TEST_CONFIG)).toThrow(/عدم تطابق تكاليف/);
  });
});

// ─── السيناريو 3: برنامج عمرة (معفى من VAT) ────────────────────────────────

describe('نموذج الأصيل — برنامج عمرة — معفى من VAT', () => {
  it('لا يُولِّد سطر VAT عندما المبلغ صفر', () => {
    const input: PrincipalPaymentReceivedInput = {
      phase: 'principal_payment_received',
      bookingType: 'umrah',
      sellingPriceExclVat: 800000,  // 8000 ر.س
      vatAmount: 0,                  // معفى
      totalAmount: 800000,
      vatCategory: 'E',
      receivingAccountCode: '1002',
      bookingRef: 'UM-2026-001',
      customerName: 'أحمد السلمي',
    };

    const result = generateJournalEntry(input, TEST_CONFIG);
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine).toBeUndefined(); // لا سطر VAT
    expect(result.lines).toHaveLength(2); // بنك + إيراد مؤجل فقط
    expect(result.isBalanced).toBe(true);
  });
});

// ─── السيناريو 4: الاسترداد مع رسوم إلغاء ───────────────────────────────────

describe('قيد الاسترداد', () => {
  /**
   * إلغاء حجز:
   *   المبلغ الأصلي: 936.25 ر.س
   *   رسوم الإلغاء: 150 ر.س + VAT 15% = 22.5 ر.س
   *   المبلغ المُعاد للعميل: 936.25 - 150 - 22.5 = 763.75 ر.س
   */
  const cancellationFee = 15000;    // 150 ر.س
  const cancellationFeeVat = calculateVat(cancellationFee, 0.15); // 2250 هللة

  const input: RefundInput = {
    phase: 'refund_issued',
    refundAmountToCustomer: 76375,  // 763.75 ر.س
    cancellationFee,
    cancellationFeeVat,
    supplierRefundReceivableAccount: '3001',
    refundPaymentAccountCode: '1002',
    bookingRef: 'BK-2026-001',
    customerName: 'عبدالله الغامدي',
  };

  it('القيد متوازن', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(result.totalCredit);
  });

  it('ذمم المورد مدينة بالمبلغ الكامل المسترجع', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const supplierLine = result.lines.find(l => l.accountCode === '3001');
    // 76375 + 15000 + 2250 = 93625
    expect(supplierLine!.debit).toBe(93625);
  });

  it('البنك دائن بما يُعاد للعميل فقط', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const bankLine = result.lines.find(l => l.accountCode === '1002');
    expect(bankLine!.credit).toBe(76375); // 763.75 ر.س
  });

  it('رسوم الإلغاء إيراد للوكالة', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const feeRevLine = result.lines.find(l => l.accountCode === '6007');
    expect(feeRevLine!.credit).toBe(15000); // 150 ر.س
  });

  it('VAT على رسوم الإلغاء', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine!.credit).toBe(2250); // 22.50 ر.س = 150 × 15%
  });

  it('لا سطر لرسوم الإلغاء عندما تكون صفراً', () => {
    const inputNoFee: RefundInput = {
      ...input,
      refundAmountToCustomer: 93625,
      cancellationFee: 0,
      cancellationFeeVat: 0,
    };
    const result = generateJournalEntry(inputNoFee, TEST_CONFIG);
    const feeLine = result.lines.find(l => l.accountCode === '6007');
    expect(feeLine).toBeUndefined();
    expect(result.isBalanced).toBe(true);
  });
});
