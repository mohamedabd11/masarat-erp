/**
 * Feature-flag definitions for Masarat ERP.
 *
 * Three commercial tiers:
 *   operations  (499 SAR/mo)  — travel operations only
 *   business    (990 SAR/mo)  — + full financial suite
 *   enterprise  (1990 SAR/mo) — + HR / advanced permissions
 *
 * Backward-compat aliases: starter → operations, professional → business.
 *
 * Per-agency overrides live in the `agency_features` table and are merged
 * on top of plan-level access in SubscriptionProvider (grant / revoke).
 */

// ─── Plan rank ────────────────────────────────────────────────────────────────

export const PLAN_RANK: Record<string, number> = {
  '':           0,
  // Current commercial tiers
  operations:   1,
  business:     2,
  enterprise:   3,
  // Backward-compat (old plan keys kept in DB)
  starter:      1,
  professional: 2,
  // Unlimited tiers
  lifetime:    10,
  trial:       10,
  super_admin: 10,
};

// ─── Feature catalogue ────────────────────────────────────────────────────────

/**
 * Minimum plan rank each feature requires.
 *   0 = always available
 *   1 = Operations+
 *   2 = Business+
 *   3 = Enterprise+
 */
export const FEATURE_MIN_RANK = {
  // Always available
  dashboard:            0,
  settings:             0,
  help:                 0,

  // ── Operations tier ────────────────────────────────────────────────────────
  bookings:             1,
  quotes:               1,
  customers:            1,
  suppliers:            1,
  pnr:                  1,
  tickets:              1,
  providers:            1,

  // ── Business tier (Financial suite) ───────────────────────────────────────
  invoices:             2,
  payments:             2,
  receipt_vouchers:     2,
  supplier_payments:    2,
  cheques:              2,
  banking:              2,
  accounting:           2,
  journal_entries:      2,
  chart_of_accounts:    2,
  financial_reports:    2,
  vat:                  2,
  reports:              2,
  audit_logs:           2,

  // ── Enterprise tier (HR suite) ─────────────────────────────────────────────
  employees:            3,
  hr:                   3,
  payroll:              3,
  attendance:           3,
  leave_management:     3,
  contracts:            3,
  advanced_permissions: 3,
  api_access:           3,
} as const;

export type FeatureKey = keyof typeof FEATURE_MIN_RANK;

// ─── Human-readable labels ────────────────────────────────────────────────────

export const FEATURE_LABEL: Record<FeatureKey, { ar: string; en: string }> = {
  dashboard:            { ar: 'لوحة التحكم',           en: 'Dashboard' },
  settings:             { ar: 'الإعدادات',              en: 'Settings' },
  help:                 { ar: 'المساعدة',               en: 'Help' },
  bookings:             { ar: 'الحجوزات',               en: 'Bookings' },
  quotes:               { ar: 'عروض الأسعار',           en: 'Quotations' },
  customers:            { ar: 'العملاء',                en: 'Customers' },
  suppliers:            { ar: 'الموردين',               en: 'Suppliers' },
  pnr:                  { ar: 'سجلات PNR',              en: 'PNR Records' },
  tickets:              { ar: 'التذاكر',                en: 'Tickets' },
  providers:            { ar: 'مزودو السفر (GDS)',      en: 'GDS Providers' },
  invoices:             { ar: 'الفواتير',               en: 'Invoices' },
  payments:             { ar: 'المدفوعات',              en: 'Payments' },
  receipt_vouchers:     { ar: 'سندات القبض',            en: 'Receipt Vouchers' },
  supplier_payments:    { ar: 'سندات الصرف',            en: 'Payment Vouchers' },
  cheques:              { ar: 'الشيكات',                en: 'Cheques' },
  banking:              { ar: 'البنوك والصناديق',       en: 'Banks & Cash' },
  accounting:           { ar: 'المحاسبة',               en: 'Accounting' },
  journal_entries:      { ar: 'القيود المحاسبية',       en: 'Journal Entries' },
  chart_of_accounts:    { ar: 'دليل الحسابات',          en: 'Chart of Accounts' },
  financial_reports:    { ar: 'التقارير المالية',       en: 'Financial Reports' },
  vat:                  { ar: 'ضريبة القيمة المضافة',   en: 'VAT / ZATCA' },
  reports:              { ar: 'التقارير',               en: 'Reports' },
  audit_logs:           { ar: 'سجل المراجعة',           en: 'Audit Log' },
  employees:            { ar: 'إدارة الموظفين',         en: 'Employees' },
  hr:                   { ar: 'الموارد البشرية',        en: 'Human Resources' },
  payroll:              { ar: 'الرواتب',                en: 'Payroll' },
  attendance:           { ar: 'الحضور والانصراف',       en: 'Attendance' },
  leave_management:     { ar: 'الإجازات',               en: 'Leave Management' },
  contracts:            { ar: 'العقود',                 en: 'Contracts' },
  advanced_permissions: { ar: 'الصلاحيات المتقدمة',    en: 'Advanced Permissions' },
  api_access:           { ar: 'وصول API',               en: 'API Access' },
};

// ─── Package templates ────────────────────────────────────────────────────────

const OPERATIONS_FEATURES: FeatureKey[] = [
  'dashboard', 'bookings', 'quotes', 'customers', 'suppliers',
  'pnr', 'tickets', 'providers', 'settings', 'help',
];

const BUSINESS_FEATURES: FeatureKey[] = [
  ...OPERATIONS_FEATURES,
  'invoices', 'payments', 'receipt_vouchers', 'supplier_payments',
  'cheques', 'banking', 'accounting', 'journal_entries', 'chart_of_accounts',
  'financial_reports', 'vat', 'reports', 'audit_logs',
];

const ENTERPRISE_FEATURES: FeatureKey[] = [
  ...BUSINESS_FEATURES,
  'employees', 'hr', 'payroll', 'attendance', 'leave_management',
  'contracts', 'advanced_permissions', 'api_access',
];

export const PACKAGE_TEMPLATES: Record<string, FeatureKey[]> = {
  operations:   OPERATIONS_FEATURES,
  starter:      OPERATIONS_FEATURES,      // backward compat
  business:     BUSINESS_FEATURES,
  professional: BUSINESS_FEATURES,        // backward compat
  enterprise:   ENTERPRISE_FEATURES,
  lifetime:     ENTERPRISE_FEATURES,
  trial:        ENTERPRISE_FEATURES,
};

// ─── Plan access check ────────────────────────────────────────────────────────

/** Returns true if the given plan string can access the requested feature. */
export function planCanAccess(plan: string, feature: FeatureKey): boolean {
  return (PLAN_RANK[plan] ?? 0) >= FEATURE_MIN_RANK[feature];
}

// ─── Plan display definitions ─────────────────────────────────────────────────

export interface PlanDisplayDef {
  key:         string;
  nameAr:      string;
  nameEn:      string;
  priceMonthly: number | null;   // SAR — null = lifetime/contact
  badgeAr:     string | null;
  badgeEn:     string | null;
  highlighted: boolean;
  features:    FeatureKey[];
  notIncluded: { ar: string[]; en: string[] };
}

export const PLAN_DISPLAY: PlanDisplayDef[] = [
  {
    key: 'operations',
    nameAr: 'باقة التشغيل',
    nameEn: 'Operations',
    priceMonthly: 499,
    badgeAr: null, badgeEn: null,
    highlighted: false,
    features: OPERATIONS_FEATURES,
    notIncluded: {
      ar: ['الفواتير', 'القيود المحاسبية', 'سندات القبض والصرف', 'التقارير المالية', 'الموارد البشرية'],
      en: ['Invoices', 'Journal Entries', 'Receipt & Payment Vouchers', 'Financial Reports', 'HR'],
    },
  },
  {
    key: 'business',
    nameAr: 'باقة الأعمال',
    nameEn: 'Business',
    priceMonthly: 990,
    badgeAr: 'الأكثر اختياراً', badgeEn: 'Most Popular',
    highlighted: true,
    features: BUSINESS_FEATURES,
    notIncluded: {
      ar: ['الموارد البشرية', 'الرواتب', 'الحضور والانصراف', 'الإجازات', 'العقود'],
      en: ['HR', 'Payroll', 'Attendance', 'Leave Management', 'Contracts'],
    },
  },
  {
    key: 'enterprise',
    nameAr: 'باقة المؤسسات',
    nameEn: 'Enterprise',
    priceMonthly: 1990,
    badgeAr: 'الأشمل', badgeEn: 'Full Suite',
    highlighted: false,
    features: ENTERPRISE_FEATURES,
    notIncluded: { ar: [], en: [] },
  },
];
