export type DemoCustomerKind = 'individual' | 'company';
export type DemoSupplierKind = 'airline' | 'hotel' | 'government' | 'transport' | 'insurance';
export type DemoPaymentMethod = 'cash' | 'bank_transfer' | 'card';
export type DemoVatCategory = 'S' | 'Z' | 'E' | 'O';

export type DemoPaymentPlan =
  | { state: 'full'; method: DemoPaymentMethod }
  | { state: 'partial'; method: DemoPaymentMethod; amountHalalas: number }
  | { state: 'none' };

export interface HistoricalDemoScenario {
  key: string;
  monthsAgo: number;
  dayOfMonth: number;
  serviceType: 'flight' | 'hotel' | 'package' | 'visa' | 'insurance' | 'transport';
  description: string;
  customer: DemoCustomerKind;
  supplier: DemoSupplierKind;
  revenueModel: 'agent' | 'principal';
  priceExclVatHalalas: number;
  costHalalas: number;
  vatCategory: DemoVatCategory;
  vatHalalas: number;
  payment: DemoPaymentPlan;
}

/**
 * ثمانية أشهر من الحالات المقصودة، لا أرقام عشوائية. تغطي الوكيل والأصيل،
 * الأفراد والشركات، الدفع الكامل والجزئي والآجل، والبنك والنقد والبطاقة.
 * القيم بالهللات كي تبقى الحسابات والضريبة قطعية بلا كسور عائمة.
 */
export const HISTORICAL_DEMO_SCENARIOS: readonly HistoricalDemoScenario[] = [
  {
    key: 'history-flight-agent-m8', monthsAgo: 8, dayOfMonth: 10,
    serviceType: 'flight', description: 'تذكرة دولية — سيناريو يناير',
    customer: 'individual', supplier: 'airline', revenueModel: 'agent',
    priceExclVatHalalas: 205_000, costHalalas: 190_000,
    vatCategory: 'S', vatHalalas: 2_250,
    payment: { state: 'full', method: 'bank_transfer' },
  },
  {
    key: 'history-hotel-principal-m7', monthsAgo: 7, dayOfMonth: 12,
    serviceType: 'hotel', description: 'إقامة فندقية لشركة — سيناريو فبراير',
    customer: 'company', supplier: 'hotel', revenueModel: 'principal',
    priceExclVatHalalas: 420_000, costHalalas: 260_000,
    vatCategory: 'S', vatHalalas: 63_000,
    payment: { state: 'full', method: 'bank_transfer' },
  },
  {
    key: 'history-visa-agent-m6', monthsAgo: 6, dayOfMonth: 14,
    serviceType: 'visa', description: 'رسوم تأشيرة خارج النطاق — سيناريو مارس',
    customer: 'individual', supplier: 'government', revenueModel: 'agent',
    priceExclVatHalalas: 125_000, costHalalas: 120_000,
    vatCategory: 'O', vatHalalas: 0,
    payment: { state: 'full', method: 'cash' },
  },
  {
    key: 'history-transport-principal-m5', monthsAgo: 5, dayOfMonth: 16,
    serviceType: 'transport', description: 'نقل سياحي لشركة — سيناريو أبريل',
    customer: 'company', supplier: 'transport', revenueModel: 'principal',
    priceExclVatHalalas: 300_000, costHalalas: 180_000,
    vatCategory: 'S', vatHalalas: 45_000,
    payment: { state: 'partial', method: 'bank_transfer', amountHalalas: 120_000 },
  },
  {
    key: 'history-insurance-agent-m4', monthsAgo: 4, dayOfMonth: 18,
    serviceType: 'insurance', description: 'تأمين سفر عبر الوكالة — سيناريو مايو',
    customer: 'individual', supplier: 'insurance', revenueModel: 'agent',
    priceExclVatHalalas: 65_000, costHalalas: 60_000,
    vatCategory: 'S', vatHalalas: 750,
    payment: { state: 'full', method: 'card' },
  },
  {
    key: 'history-package-principal-m3', monthsAgo: 3, dayOfMonth: 20,
    serviceType: 'package', description: 'باقة سياحية آجلة — سيناريو يونيو',
    customer: 'company', supplier: 'hotel', revenueModel: 'principal',
    priceExclVatHalalas: 760_000, costHalalas: 470_000,
    vatCategory: 'S', vatHalalas: 114_000,
    payment: { state: 'none' },
  },
  {
    key: 'history-hotel-agent-m2', monthsAgo: 2, dayOfMonth: 22,
    serviceType: 'hotel', description: 'حجز فندق بعمولة — سيناريو يوليو',
    customer: 'individual', supplier: 'hotel', revenueModel: 'agent',
    priceExclVatHalalas: 340_000, costHalalas: 320_000,
    vatCategory: 'S', vatHalalas: 3_000,
    payment: { state: 'full', method: 'cash' },
  },
  {
    key: 'history-flight-principal-m1', monthsAgo: 1, dayOfMonth: 24,
    serviceType: 'flight', description: 'مجموعة طيران لشركة — سيناريو أغسطس',
    customer: 'company', supplier: 'airline', revenueModel: 'principal',
    priceExclVatHalalas: 520_000, costHalalas: 410_000,
    vatCategory: 'S', vatHalalas: 78_000,
    payment: { state: 'partial', method: 'card', amountHalalas: 250_000 },
  },
] as const;

export function historicalScenarioDate(asOfDate: string, scenario: HistoricalDemoScenario): string {
  const asOf = new Date(`${asOfDate}T12:00:00.000Z`);
  if (Number.isNaN(asOf.getTime())) throw new Error('asOfDate يجب أن يكون تاريخ ISO صالحاً');

  const year = asOf.getUTCFullYear();
  const monthIndex = asOf.getUTCMonth() - scenario.monthsAgo;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, scenario.dayOfMonth), lastDay);
  return new Date(Date.UTC(year, monthIndex, day, 12)).toISOString().slice(0, 10);
}
