/**
 * Canonical default chart of accounts — single source of truth.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every agency must end up with EXACTLY this set of system accounts. Previously
 * the list was copied into three places that drifted apart:
 *   - api/auth/register  (full list, used for brand-new agencies)
 *   - api/auth/sync      (a shorter, stale subset)
 *   - instrumentation.ts (backfilled only 1230 + 8399)
 * Agencies created before a code was added (e.g. 3201 deferred revenue, 5900 FX
 * loss) never received it, so any deferred-revenue or FX journal posted to that
 * code became invisible in the trial balance — which reads the chart of accounts
 * and silently drops codes it doesn't recognise (off-by-exactly-that-amount).
 *
 * Importing this one list everywhere — plus the boot-time backfill in
 * instrumentation.ts — guarantees completeness for new AND pre-existing agencies.
 */
export type CoaAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface CoaAccount {
  code:   string;
  nameAr: string;
  nameEn: string;
  type:   CoaAccountType;
}

export const DEFAULT_COA: readonly CoaAccount[] = [
  { code: '1100', nameAr: 'النقدية',                          nameEn: 'Cash',                           type: 'asset'     },
  { code: '1110', nameAr: 'البنك',                            nameEn: 'Bank',                           type: 'asset'     },
  { code: '1115', nameAr: 'نقاط البيع / بطاقات الائتمان',     nameEn: 'POS / Credit Cards',             type: 'asset'     },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',                nameEn: 'Accounts Receivable',            type: 'asset'     },
  { code: '1125', nameAr: 'أوراق قبض - شيكات',                nameEn: 'Cheques Receivable',             type: 'asset'     },
  { code: '1230', nameAr: 'ضريبة المدخلات القابلة للاسترداد', nameEn: 'Input VAT Receivable',           type: 'asset'     },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',         nameEn: 'Prepaid Expenses',               type: 'asset'     },
  { code: '1350', nameAr: 'مقاصة BSP',                        nameEn: 'BSP Clearing',                   type: 'asset'     },
  { code: '2000', nameAr: 'ذمم دائنة - موردون',              nameEn: 'Accounts Payable - Suppliers',   type: 'liability' },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',       nameEn: 'Accounts Payable - Airlines',    type: 'liability' },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',               nameEn: 'Accounts Payable - Hotels',      type: 'liability' },
  { code: '2150', nameAr: 'مستحقات BSP',                      nameEn: 'BSP Payable',                    type: 'liability' },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة',     nameEn: 'VAT Payable',                    type: 'liability' },
  { code: '2300', nameAr: 'ودائع العملاء',                    nameEn: 'Customer Deposits',              type: 'liability' },
  { code: '2310', nameAr: 'رواتب مستحقة للدفع',               nameEn: 'Salaries Payable',               type: 'liability' },
  { code: '2400', nameAr: 'GOSI مستحقة',                       nameEn: 'GOSI Payable',                   type: 'liability' },
  { code: '2500', nameAr: 'مخصص مكافأة نهاية الخدمة',         nameEn: 'EOSB Provision',                 type: 'liability' },
  { code: '3100', nameAr: 'رأس مال المالك',                   nameEn: 'Owner Capital',                  type: 'equity'    },
  { code: '3200', nameAr: 'الأرباح المحتجزة',                 nameEn: 'Retained Earnings',              type: 'equity'    },
  { code: '3202', nameAr: 'أرباح محتجزة - سنة سابقة',        nameEn: 'Retained Earnings - Prior Year', type: 'equity'    },
  { code: '3201', nameAr: 'إيراد مؤجل - خدمات سفر',           nameEn: 'Deferred Revenue - Travel',      type: 'liability' },
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',              nameEn: 'Revenue - Agency Fees',          type: 'revenue'   },
  { code: '4100', nameAr: 'إيراد خدمات السفر',               nameEn: 'Revenue - Travel Services',      type: 'revenue'   },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',        nameEn: 'Tour Package Revenue',           type: 'revenue'   },
  { code: '4120', nameAr: 'إيرادات الفنادق',                 nameEn: 'Hotel Revenue',                  type: 'revenue'   },
  { code: '4130', nameAr: 'إيرادات العمرة',                  nameEn: 'Umrah Revenue',                  type: 'revenue'   },
  { code: '4140', nameAr: 'إيرادات التأشيرات',               nameEn: 'Visa Revenue',                   type: 'revenue'   },
  { code: '4150', nameAr: 'إيرادات التأمين',                 nameEn: 'Insurance Revenue',              type: 'revenue'   },
  { code: '4200', nameAr: 'إيراد رسوم الإلغاء',              nameEn: 'Cancellation Fee Revenue',       type: 'revenue'   },
  { code: '4420', nameAr: 'إيراد استرداد ADM',               nameEn: 'ADM Recovery Income',            type: 'revenue'   },
  { code: '4510', nameAr: 'إيراد فروق المطابقة البنكية',      nameEn: 'Bank Reconciliation Income',     type: 'revenue'   },
  { code: '4900', nameAr: 'أرباح فروق أسعار الصرف',           nameEn: 'FX Exchange Gain',               type: 'revenue'   },
  { code: '5000', nameAr: 'تكلفة الخدمات',                   nameEn: 'Cost of Services',               type: 'expense'   },
  { code: '5100', nameAr: 'الرواتب والأجور',                 nameEn: 'Salaries',                       type: 'expense'   },
  { code: '5200', nameAr: 'الإيجار',                         nameEn: 'Rent',                           type: 'expense'   },
  { code: '5300', nameAr: 'التسويق والإعلان',                nameEn: 'Marketing',                      type: 'expense'   },
  { code: '5400', nameAr: 'المصاريف التشغيلية',              nameEn: 'Operating Expenses',             type: 'expense'   },
  { code: '5420', nameAr: 'مصروف ADM',                       nameEn: 'ADM Expense',                    type: 'expense'   },
  { code: '5510', nameAr: 'مصروف فروق المطابقة البنكية',      nameEn: 'Bank Reconciliation Expense',    type: 'expense'   },
  { code: '5900', nameAr: 'خسائر فروق أسعار الصرف',           nameEn: 'FX Exchange Loss',               type: 'expense'   },
  { code: '6100', nameAr: 'مصروف الرواتب',                   nameEn: 'Salary Expense',                 type: 'expense'   },
  { code: '6200', nameAr: 'مصروف GOSI - صاحب العمل',         nameEn: 'GOSI Expense - Employer',        type: 'expense'   },
  { code: '6300', nameAr: 'مصروف مكافأة نهاية الخدمة',       nameEn: 'EOSB Expense',                   type: 'expense'   },
  { code: '8399', nameAr: 'فروق التقريب',                     nameEn: 'Rounding Differences',           type: 'expense'   },
  { code: '9001', nameAr: 'حساب التعليق - دخل',               nameEn: 'Suspense Income',                type: 'revenue'   },
] as const;
