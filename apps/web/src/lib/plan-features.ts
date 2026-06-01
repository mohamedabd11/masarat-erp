/**
 * Feature catalogue for Masarat ERP.
 *
 * Single-plan model: every agency receives ALL features.
 * The only per-agency differences are:
 *   • maxUsers  — seat limit set by the system admin
 *   • subscriptionStatus — trial / active / suspended / expired / lifetime
 *   • per-agency feature overrides (admin can disable any section per agency)
 *
 * FEATURE_LABEL is used by the admin features panel and the sidebar.
 */

// ─── Feature catalogue ────────────────────────────────────────────────────────

export const ALL_FEATURES = [
  // Core (always shown)
  'dashboard',
  'settings',
  'help',
  // Operations
  'bookings',
  'quotes',
  'customers',
  'suppliers',
  'pnr',
  'tickets',
  'providers',
  // Finance
  'invoices',
  'payments',
  'receipt_vouchers',
  'supplier_payments',
  'cheques',
  'banking',
  'accounting',
  'journal_entries',
  'chart_of_accounts',
  'financial_reports',
  'vat',
  'reports',
  'audit_logs',
  // HR
  'employees',
  'hr',
  'payroll',
  'attendance',
  'leave_management',
  'contracts',
  'advanced_permissions',
  'api_access',
] as const;

export type FeatureKey = typeof ALL_FEATURES[number];

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

// ─── Feature groups for admin UI ──────────────────────────────────────────────

export const FEATURE_GROUPS: { key: string; ar: string; en: string; features: FeatureKey[] }[] = [
  {
    key: 'core',
    ar: 'أساسي',
    en: 'Core',
    features: ['dashboard', 'settings', 'help'],
  },
  {
    key: 'operations',
    ar: 'العمليات',
    en: 'Operations',
    features: ['bookings', 'quotes', 'customers', 'suppliers', 'pnr', 'tickets', 'providers'],
  },
  {
    key: 'finance',
    ar: 'المالية',
    en: 'Finance',
    features: ['invoices', 'payments', 'receipt_vouchers', 'supplier_payments', 'cheques', 'banking', 'accounting', 'journal_entries', 'chart_of_accounts', 'financial_reports', 'vat', 'reports', 'audit_logs'],
  },
  {
    key: 'hr',
    ar: 'الموارد البشرية',
    en: 'Human Resources',
    features: ['employees', 'hr', 'payroll', 'attendance', 'leave_management', 'contracts', 'advanced_permissions', 'api_access'],
  },
];

// ─── Backward-compat stub (keeps old imports working) ─────────────────────────

/** @deprecated Plan tiers removed. All features available to all agencies. */
export function planCanAccess(_plan: string, _feature: FeatureKey): boolean {
  return true;
}
