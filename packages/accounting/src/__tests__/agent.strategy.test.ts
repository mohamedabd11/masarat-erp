import { describe, it, expect } from 'vitest';
import { generateJournalEntry } from '../engine';
import { calculateVat } from '../money';
import type { AgencyAccountingConfig, AgentPaymentReceivedInput, AgentServiceDeliveredInput } from '../types';

// ─── إعدادات وكالة الاختبار ──────────────────────────────────────────────────

const TEST_CONFIG: AgencyAccountingConfig = {
  agencyId: 'ag_test_001',
  vatRate: 0.15,
  defaultRevenueModel: {
    flight: 'agent',
    hotel: 'agent',
    package: 'principal',
    umrah: 'principal',
    hajj: 'principal',
  },
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

// ─── السيناريو 1: تذكرة طيران دولي — المرحلة 1 (استلام الدفعة) ──────────────

describe('نموذج الوكيل — طيران دولي — المرحلة 1: استلام الدفعة', () => {
  /**
   * المعاملة:
   *   تذكرة الرياض → لندن
   *   سعر التذكرة: 850 ر.س (85,000 هللة) — لا VAT (صفري)
   *   رسوم الخدمة: 75 ر.س (7,500 هللة) — خاضع 15%
   *   VAT على الخدمة: 11.25 ر.س (1,125 هللة)
   *   الإجمالي: 936.25 ر.س (93,625 هللة)
   */
  const costPrice = 85000;    // 850 ر.س
  const serviceFee = 7500;    // 75 ر.س
  const vatOnServiceFee = calculateVat(serviceFee, 0.15); // 1125 هللة

  const input: AgentPaymentReceivedInput = {
    phase: 'agent_payment_received',
    bookingType: 'flight',
    isInternational: true,
    costPrice,
    serviceFee,
    serviceFeeVatCategory: 'S',
    serviceFeeVatAmount: vatOnServiceFee,
    receivingAccountCode: '1002',
    bookingRef: 'BK-2026-001',
    customerName: 'عبدالله الغامدي',
  };

  it('يُولِّد 4 سطور صحيحة', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.lines).toHaveLength(4);
  });

  it('القيد متوازن', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(result.totalCredit);
    expect(result.totalDebit).toBe(93625);
  });

  it('السطر 1 مدين: البنك بالإجمالي كاملاً', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const bankLine = result.lines.find(l => l.accountCode === '1002');
    expect(bankLine).toBeDefined();
    expect(bankLine!.debit).toBe(93625); // 850 + 75 + 11.25 = 936.25 ر.س
    expect(bankLine!.credit).toBe(0);
  });

  it('أمانات العملاء = قيمة التذكرة فقط (لا رسوم الخدمة)', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const depositLine = result.lines.find(l => l.accountCode === '3202');
    expect(depositLine).toBeDefined();
    expect(depositLine!.credit).toBe(85000); // 850 ر.س فقط
  });

  it('الإيراد المؤجل = رسوم الخدمة بدون VAT', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const deferredLine = result.lines.find(l => l.accountCode === '3201');
    expect(deferredLine).toBeDefined();
    expect(deferredLine!.credit).toBe(7500); // 75 ر.س
  });

  it('VAT Output = 15% من رسوم الخدمة فقط (لا من قيمة التذكرة)', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const vatLine = result.lines.find(l => l.accountCode === '3101');
    expect(vatLine).toBeDefined();
    expect(vatLine!.credit).toBe(1125); // 11.25 ر.س = 7500 × 15%
  });

  it('النوع الصحيح والبيانات الوصفية', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.type).toBe('payment_received');
    expect(result.metadata.revenueModel).toBe('agent');
    expect(result.metadata.bookingType).toBe('flight');
    expect(result.metadata.isInternational).toBe(true);
  });
});

// ─── السيناريو 2: طيران دولي — المرحلة 2 (إصدار التذكرة) ───────────────────

describe('نموذج الوكيل — طيران دولي — المرحلة 2: إصدار التذكرة', () => {
  /**
   * بعد استلام الدفعة، تصدر الوكالة التذكرة.
   * سعر التذكرة من الخط الجوي: 850 ر.س (لا عمولة من الخط في هذه الحالة)
   * رسوم الخدمة المؤجلة: 75 ر.س
   */
  const input: AgentServiceDeliveredInput = {
    phase: 'agent_service_delivered',
    bookingType: 'flight',
    isInternational: true,
    customerDepositAmount: 85000, // الأمانة التي تُحرَّر
    netCostToSupplier: 85000,     // نفس قيمة الأمانة (لا عمولة من الخط)
    serviceFee: 7500,
    supplierPayableAccountCode: '3001', // ذمم الخطوط الجوية
    bookingRef: 'BK-2026-001',
  };

  it('القيد متوازن', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebit).toBe(result.totalCredit);
  });

  it('تحرير الأمانة مديناً بالمبلغ الكامل', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const depositLine = result.lines.find(l => l.accountCode === '3202');
    expect(depositLine).toBeDefined();
    expect(depositLine!.debit).toBe(85000);
  });

  it('ذمم الخط الجوي دائناً بتكلفة التذكرة', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const supplierLine = result.lines.find(l => l.accountCode === '3001');
    expect(supplierLine).toBeDefined();
    expect(supplierLine!.credit).toBe(85000);
  });

  it('تحرير الإيراد المؤجل واعتراف برسوم الخدمة', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const deferredDebitLine = result.lines.find(
      l => l.accountCode === '3201' && l.debit > 0
    );
    const serviceFeeRevLine = result.lines.find(
      l => l.accountCode === '6007' && l.credit > 0
    );
    expect(deferredDebitLine!.debit).toBe(7500);
    expect(serviceFeeRevLine!.credit).toBe(7500);
  });

  it('لا يوجد سطر عمولة عندما لا توجد عمولة من المورد', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    const commissionLine = result.lines.find(l => l.accountCode === '6002');
    expect(commissionLine).toBeUndefined();
  });
});

// ─── السيناريو 3: طيران دولي مع عمولة من المورد ─────────────────────────────

describe('نموذج الوكيل — مع عمولة من المورد', () => {
  const input: AgentServiceDeliveredInput = {
    phase: 'agent_service_delivered',
    bookingType: 'flight',
    isInternational: true,
    customerDepositAmount: 85000, // ما دفعه العميل مقابل التذكرة
    netCostToSupplier: 80000,     // ما تدفعه الوكالة للخط الجوي فعلاً (بعد العمولة)
    serviceFee: 7500,
    supplierPayableAccountCode: '3001',
    bookingRef: 'BK-2026-002',
  };

  it('يسجل عمولة المورد = الفرق بين الأمانة والتكلفة', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    // عمولة المورد = 85000 - 80000 = 5000 هللة = 50 ر.س
    const commissionLine = result.lines.find(l => l.accountCode === '6002');
    expect(commissionLine).toBeDefined();
    expect(commissionLine!.credit).toBe(5000);
  });

  it('القيد لا يزال متوازناً', () => {
    const result = generateJournalEntry(input, TEST_CONFIG);
    expect(result.totalDebit).toBe(result.totalCredit);
  });
});

// ─── السيناريو 4: فندق محلي — نموذج الوكيل ──────────────────────────────────

describe('نموذج الوكيل — فندق محلي', () => {
  it('يستخدم حساب العمولة المحلية للفندق', () => {
    const input: AgentServiceDeliveredInput = {
      phase: 'agent_service_delivered',
      bookingType: 'hotel',
      isInternational: false,
      customerDepositAmount: 120000, // 1200 ر.س
      netCostToSupplier: 100000,     // 1000 ر.س
      serviceFee: 0,                 // لا رسوم خدمة في هذه الحالة
      supplierPayableAccountCode: '3002',
      bookingRef: 'BK-2026-003',
    };

    const result = generateJournalEntry(input, TEST_CONFIG);
    const commissionLine = result.lines.find(l => l.accountCode === '6003'); // محلي
    expect(commissionLine).toBeDefined();
    expect(commissionLine!.credit).toBe(20000); // 200 ر.س فرق

    expect(result.totalDebit).toBe(result.totalCredit);
  });
});

// ─── السيناريو 5: التحقق من رسالة الخطأ عند تناقض البيانات ─────────────────

describe('أخطاء التحقق في الاستراتيجية', () => {
  it('يرمي خطأ عندما الأمانة أقل من تكلفة المورد', () => {
    const input: AgentServiceDeliveredInput = {
      phase: 'agent_service_delivered',
      bookingType: 'flight',
      isInternational: false,
      customerDepositAmount: 80000, // أقل من التكلفة!
      netCostToSupplier: 85000,
      serviceFee: 0,
      supplierPayableAccountCode: '3001',
      bookingRef: 'BK-ERROR-001',
    };

    expect(() => generateJournalEntry(input, TEST_CONFIG)).toThrow(/أقل من تكلفة المورد/);
  });
});
