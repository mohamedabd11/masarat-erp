/**
 * Seed Script — البيانات الأولية لحساب مالي افتراضي
 * يُستخدم في التطوير والاختبار
 *
 * تشغيل: pnpm --filter @masarat/database db:seed
 */

import { createDbClient } from './client.js';
import { agencies, agencyAccountingConfigs, chartOfAccounts } from '../schema/index.js';

const DEFAULT_COA = [
  // Assets
  { code: '1100', nameAr: 'الصندوق النقدي', nameEn: 'Cash on Hand', type: 'asset' as const, normalSide: 'debit' as const, level: 1, isSystem: true },
  { code: '1110', nameAr: 'الحساب البنكي الرئيسي', nameEn: 'Main Bank Account', type: 'asset' as const, normalSide: 'debit' as const, level: 1, isSystem: true },
  { code: '1115', nameAr: 'نقاط البيع', nameEn: 'POS Terminal', type: 'asset' as const, normalSide: 'debit' as const, level: 1 },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء', nameEn: 'Accounts Receivable - Customers', type: 'asset' as const, normalSide: 'debit' as const, level: 1 },
  { code: '1203', nameAr: 'ضريبة القيمة المضافة - مدخلات', nameEn: 'VAT Input', type: 'asset' as const, normalSide: 'debit' as const, level: 1 },
  { code: '1004', nameAr: 'حساب تسوية BSP', nameEn: 'BSP Clearing Account', type: 'asset' as const, normalSide: 'debit' as const, level: 1 },

  // Liabilities
  { code: '2000', nameAr: 'ذمم دائنة - موردون', nameEn: 'Accounts Payable - Suppliers', type: 'liability' as const, normalSide: 'credit' as const, level: 1 },
  { code: '2100', nameAr: 'ذمم دائنة - شركات طيران', nameEn: 'Accounts Payable - Airlines', type: 'liability' as const, normalSide: 'credit' as const, level: 1 },
  { code: '2101', nameAr: 'ذمم دائنة - فنادق', nameEn: 'Accounts Payable - Hotels', type: 'liability' as const, normalSide: 'credit' as const, level: 1 },
  { code: '2102', nameAr: 'ذمم دائنة - شركات العمرة', nameEn: 'Accounts Payable - Umrah Operators', type: 'liability' as const, normalSide: 'credit' as const, level: 1 },
  { code: '2103', nameAr: 'ذمم دائنة - التأمين', nameEn: 'Accounts Payable - Insurance', type: 'liability' as const, normalSide: 'credit' as const, level: 1 },
  { code: '3101', nameAr: 'ضريبة القيمة المضافة - مخرجات', nameEn: 'VAT Output', type: 'liability' as const, normalSide: 'credit' as const, level: 1, isSystem: true },
  { code: '3201', nameAr: 'إيراد مؤجل', nameEn: 'Deferred Revenue', type: 'liability' as const, normalSide: 'credit' as const, level: 1, isSystem: true },
  { code: '3202', nameAr: 'أمانات العملاء', nameEn: 'Customer Deposits', type: 'liability' as const, normalSide: 'credit' as const, level: 1, isSystem: true },

  // Equity
  { code: '4100', nameAr: 'رأس المال', nameEn: 'Capital', type: 'equity' as const, normalSide: 'credit' as const, level: 1 },
  { code: '4200', nameAr: 'الأرباح المحتجزة', nameEn: 'Retained Earnings', type: 'equity' as const, normalSide: 'credit' as const, level: 1 },

  // Revenue
  { code: '6001', nameAr: 'عمولات - طيران داخلي', nameEn: 'Commission - Domestic Flights', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6002', nameAr: 'عمولات - طيران دولي', nameEn: 'Commission - International Flights', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6003', nameAr: 'عمولات - فنادق محلية', nameEn: 'Commission - Domestic Hotels', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6004', nameAr: 'عمولات - فنادق دولية', nameEn: 'Commission - International Hotels', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6005', nameAr: 'عمولات - عمرة وحج', nameEn: 'Commission - Umrah & Hajj', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6006', nameAr: 'عمولات - تأمين', nameEn: 'Commission - Insurance', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6007', nameAr: 'رسوم الخدمة والإلغاء', nameEn: 'Service & Cancellation Fees', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },
  { code: '6101', nameAr: 'إيراد الباقات السياحية', nameEn: 'Package Revenue', type: 'revenue' as const, normalSide: 'credit' as const, level: 1 },

  // Cost of Services
  { code: '7001', nameAr: 'تكلفة تذاكر الطيران', nameEn: 'Cost of Flights', type: 'expense' as const, normalSide: 'debit' as const, level: 1 },
  { code: '7002', nameAr: 'تكلفة الفنادق', nameEn: 'Cost of Hotels', type: 'expense' as const, normalSide: 'debit' as const, level: 1 },
  { code: '7003', nameAr: 'تكلفة الباقات', nameEn: 'Cost of Packages', type: 'expense' as const, normalSide: 'debit' as const, level: 1 },

  // Operating Expenses
  { code: '8100', nameAr: 'رواتب وأجور', nameEn: 'Salaries & Wages', type: 'expense' as const, normalSide: 'debit' as const, level: 1 },
  { code: '8200', nameAr: 'إيجار المكتب', nameEn: 'Office Rent', type: 'expense' as const, normalSide: 'debit' as const, level: 1 },
  { code: '8300', nameAr: 'تكاليف التشغيل', nameEn: 'Operating Expenses', type: 'expense' as const, normalSide: 'debit' as const, level: 1 },
  { code: '8399', nameAr: 'فروق التقريب', nameEn: 'Rounding Differences', type: 'expense' as const, normalSide: 'debit' as const, level: 1, isSystem: true, allowManualEntry: false },
];

async function seed() {
  const db = createDbClient();

  console.log('🌱 Starting seed...');

  // إنشاء وكالة تجريبية
  const [agency] = await db
    .insert(agencies)
    .values({
      nameAr: 'وكالة مسارات للسفر',
      nameEn: 'Masarat Travel Agency',
      crNumber: '1010000001',
      vatNumber: '300000000000003',
      subscriptionPlan: 'trial',
      subscriptionStatus: 'trial',
      maxUsers: 2,
    })
    .returning();

  console.log(`✅ Agency created: ${agency.id}`);

  // إنشاء إعدادات المحاسبة
  await db.insert(agencyAccountingConfigs).values({
    agencyId: agency.id,
    vatRateBps: 1500,
    accountMapping: {
      mainCashAccount: '1100',
      mainBankAccount: '1110',
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
      airlinePayableAccount: '2100',
      hotelPayableAccount: '2101',
      umrahPayableAccount: '2102',
      insurancePayableAccount: '2103',
      vatOutputAccount: '3101',
      vatInputAccount: '1203',
      roundingDifferenceAccount: '8399',
    },
    defaultRevenueModels: {
      flight: 'agent',
      hotel: 'agent',
      package: 'principal',
      umrah: 'principal',
      hajj: 'principal',
      insurance: 'agent',
      visa: 'agent',
      transport: 'agent',
    },
  });

  console.log('✅ Accounting config created');

  // إنشاء دليل الحسابات
  await db.insert(chartOfAccounts).values(
    DEFAULT_COA.map((account) => ({
      agencyId: agency.id,
      code: account.code,
      nameAr: account.nameAr,
      nameEn: account.nameEn,
      type: account.type,
      normalSide: account.normalSide,
      level: account.level ?? 1,
      isSystem: account.isSystem ?? false,
      allowManualEntry: account.allowManualEntry ?? true,
      balanceHalalas: 0n,
    }))
  );

  console.log(`✅ Chart of accounts created (${DEFAULT_COA.length} accounts)`);
  console.log('\n🎉 Seed completed successfully!');
  console.log(`\nAgency ID: ${agency.id}`);
  console.log('Use this ID in your tests and development.');
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
