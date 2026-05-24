'use client';

import { useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, BarChart3, Download,
  FileText, CheckCircle2, AlertCircle, Printer,
  ChevronDown, ChevronRight, Receipt, Wallet,
  Building2, Scale, ListTree, Stamp, Calendar,
  PieChart, Users, Plane, Moon, Shield, Star,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'q1' | 'q2' | 'h1' | 'fy';

interface TrialAccount {
  code: string;
  nameAr: string;
  nameEn: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  openDebit: number;
  openCredit: number;
  mvtDebit: number;
  mvtCredit: number;
}

interface PLSection {
  titleAr: string;
  titleEn: string;
  lines: PLLine[];
}

interface PLLine {
  labelAr: string;
  labelEn: string;
  amount: number;
  indent?: boolean;
  bold?: boolean;
  accent?: 'emerald' | 'red' | 'brand' | 'amber';
  separator?: boolean;
}

interface VATBox {
  box: string;
  labelAr: string;
  labelEn: string;
  noteAr: string;
  noteEn: string;
  base: number;
  vat: number;
  rate?: '15%' | '0%' | 'exempt' | 'reverse';
  highlight?: 'output' | 'input' | 'net-due' | 'net-refund';
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const MONTHLY: { nameAr: string; nameEn: string; bookings: number; rev: number; cost: number; vat: number }[] = [
  { nameAr: 'يناير', nameEn: 'Jan', bookings: 28, rev: 3_450_000, cost: 2_120_000, vat: 374_348 },
  { nameAr: 'فبراير', nameEn: 'Feb', bookings: 32, rev: 4_120_000, cost: 2_560_000, vat: 449_565 },
  { nameAr: 'مارس',  nameEn: 'Mar', bookings: 41, rev: 5_890_000, cost: 3_740_000, vat: 641_739 },
  { nameAr: 'أبريل', nameEn: 'Apr', bookings: 38, rev: 5_200_000, cost: 3_200_000, vat: 567_391 },
  { nameAr: 'مايو',  nameEn: 'May', bookings: 45, rev: 6_340_000, cost: 3_910_000, vat: 690_000 },
];

const TYPE_MIX = [
  { nameAr: 'عمرة وحج',       nameEn: 'Umrah & Hajj',   pct: 34, rev: 8_500_000, color: 'bg-brand-500',   dot: 'bg-brand-500' },
  { nameAr: 'طيران',          nameEn: 'Flights',         pct: 22, rev: 5_500_000, color: 'bg-sky-500',     dot: 'bg-sky-500' },
  { nameAr: 'باقات سياحية',   nameEn: 'Tour Packages',  pct: 18, rev: 4_500_000, color: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { nameAr: 'فنادق',          nameEn: 'Hotels',          pct: 13, rev: 3_250_000, color: 'bg-amber-500',   dot: 'bg-amber-500' },
  { nameAr: 'تأشيرات',        nameEn: 'Visas',           pct: 8,  rev: 2_000_000, color: 'bg-red-400',     dot: 'bg-red-400' },
  { nameAr: 'أخرى',           nameEn: 'Other',           pct: 5,  rev: 1_250_000, color: 'bg-slate-400',   dot: 'bg-slate-400' },
];

// ── Trial Balance ─────────────────────────────────────────────────────────────

const TRIAL_ACCOUNTS: TrialAccount[] = [
  // Assets
  { code: '1110', nameAr: 'البنك — الحساب الجاري',           nameEn: 'Bank — Current Account',           category: 'asset',     openDebit: 5_800_000,  openCredit: 0,          mvtDebit: 12_040_000, mvtCredit: 9_100_000 },
  { code: '1111', nameAr: 'الصندوق — نقدية',                  nameEn: 'Cash on Hand',                     category: 'asset',     openDebit: 380_000,    openCredit: 0,          mvtDebit: 1_200_000,  mvtCredit: 980_000 },
  { code: '1120', nameAr: 'ذمم مدينة — عملاء',                nameEn: 'Accounts Receivable — Customers',  category: 'asset',     openDebit: 2_400_000,  openCredit: 0,          mvtDebit: 6_230_000,  mvtCredit: 4_100_000 },
  { code: '1130', nameAr: 'مصاريف مدفوعة مقدماً',            nameEn: 'Prepaid Expenses',                 category: 'asset',     openDebit: 480_000,    openCredit: 0,          mvtDebit: 0,           mvtCredit: 120_000 },
  { code: '1210', nameAr: 'أصول ثابتة — أجهزة وأثاث',       nameEn: 'Fixed Assets — Equipment',         category: 'asset',     openDebit: 1_200_000,  openCredit: 0,          mvtDebit: 0,           mvtCredit: 0 },
  // Liabilities
  { code: '2110', nameAr: 'ذمم دائنة — موردون وشركات',       nameEn: 'Accounts Payable — Suppliers',     category: 'liability', openDebit: 0,          openCredit: 1_900_000,  mvtDebit: 3_800_000,  mvtCredit: 5_100_000 },
  { code: '2310', nameAr: 'ضريبة القيمة المضافة — مستحقة',   nameEn: 'VAT Payable',                      category: 'liability', openDebit: 0,          openCredit: 440_000,    mvtDebit: 218_000,    mvtCredit: 880_000 },
  { code: '2320', nameAr: 'ضريبة القيمة المضافة — مدخلات',   nameEn: 'VAT Recoverable (Input)',          category: 'liability', openDebit: 0,          openCredit: 0,          mvtDebit: 495_000,    mvtCredit: 495_000 },
  // Equity
  { code: '3110', nameAr: 'رأس المال المدفوع',                nameEn: 'Paid-in Capital',                  category: 'equity',    openDebit: 0,          openCredit: 5_000_000,  mvtDebit: 0,           mvtCredit: 0 },
  { code: '3120', nameAr: 'أرباح محتجزة — فترات سابقة',      nameEn: 'Retained Earnings',                category: 'equity',    openDebit: 0,          openCredit: 2_920_000,  mvtDebit: 0,           mvtCredit: 0 },
  // Revenue
  { code: '4110', nameAr: 'إيرادات باقات سياحية',             nameEn: 'Tour Package Revenue',             category: 'revenue',   openDebit: 0,          openCredit: 0,          mvtDebit: 0,           mvtCredit: 4_500_000 },
  { code: '4120', nameAr: 'إيرادات برامج عمرة وحج',           nameEn: 'Umrah & Hajj Revenue',             category: 'revenue',   openDebit: 0,          openCredit: 0,          mvtDebit: 0,           mvtCredit: 8_500_000 },
  { code: '4130', nameAr: 'إيرادات فنادق',                    nameEn: 'Hotel Revenue',                    category: 'revenue',   openDebit: 0,          openCredit: 0,          mvtDebit: 0,           mvtCredit: 3_250_000 },
  { code: '4210', nameAr: 'عمولات حجز طيران',                 nameEn: 'Flight Commission Revenue',        category: 'revenue',   openDebit: 0,          openCredit: 0,          mvtDebit: 0,           mvtCredit: 3_200_000 },
  { code: '4220', nameAr: 'رسوم تأشيرات وخدمات',             nameEn: 'Visa & Service Fees',              category: 'revenue',   openDebit: 0,          openCredit: 0,          mvtDebit: 0,           mvtCredit: 1_550_000 },
  // Expenses
  { code: '5110', nameAr: 'تكلفة الباقات السياحية',          nameEn: 'Cost of Tour Packages',            category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 3_200_000,  mvtCredit: 0 },
  { code: '5120', nameAr: 'تكلفة برامج العمرة والحج',        nameEn: 'Cost of Umrah & Hajj Programs',    category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 6_200_000,  mvtCredit: 0 },
  { code: '5130', nameAr: 'تكلفة خدمات الفنادق',             nameEn: 'Cost of Hotel Services',           category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 2_530_000,  mvtCredit: 0 },
  { code: '5310', nameAr: 'رواتب وأجور',                      nameEn: 'Salaries & Wages',                 category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 2_400_000,  mvtCredit: 0 },
  { code: '5320', nameAr: 'إيجار المكتب',                     nameEn: 'Office Rent',                      category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 600_000,    mvtCredit: 0 },
  { code: '5330', nameAr: 'مصاريف التسويق والإعلان',         nameEn: 'Marketing & Advertising',          category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 320_000,    mvtCredit: 0 },
  { code: '5340', nameAr: 'مصاريف إدارية عامة',              nameEn: 'General & Administrative',         category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 220_000,    mvtCredit: 0 },
  { code: '5350', nameAr: 'عمولات بنكية ورسوم GDS',          nameEn: 'Bank & GDS Charges',               category: 'expense',   openDebit: 0,          openCredit: 0,          mvtDebit: 96_000,     mvtCredit: 0 },
];

// ── P&L ───────────────────────────────────────────────────────────────────────

const PL_SECTIONS: PLSection[] = [
  {
    titleAr: 'الإيرادات', titleEn: 'Revenue',
    lines: [
      { labelAr: 'نموذج أصيل — باقات سياحية',         labelEn: 'Principal — Tour Packages',          amount: 4_500_000, indent: true },
      { labelAr: 'نموذج أصيل — عمرة وحج',             labelEn: 'Principal — Umrah & Hajj',           amount: 8_500_000, indent: true },
      { labelAr: 'نموذج أصيل — فنادق',                labelEn: 'Principal — Hotels',                 amount: 3_250_000, indent: true },
      { labelAr: 'نموذج وسيط — عمولات طيران',         labelEn: 'Agent — Flight Commissions',         amount: 3_200_000, indent: true },
      { labelAr: 'نموذج وسيط — رسوم تأشيرات وخدمات', labelEn: 'Agent — Visa & Service Fees',        amount: 1_550_000, indent: true },
      { labelAr: 'إجمالي الإيرادات (صافي من الضريبة)', labelEn: 'Total Revenue (excl. VAT)',          amount: 21_000_000, bold: true, accent: 'brand' },
    ],
  },
  {
    titleAr: 'تكلفة الخدمات', titleEn: 'Cost of Services',
    lines: [
      { labelAr: 'تكلفة الباقات السياحية',    labelEn: 'Cost of Tour Packages',          amount: -3_200_000, indent: true },
      { labelAr: 'تكلفة برامج العمرة والحج',  labelEn: 'Cost of Umrah & Hajj Programs',  amount: -6_200_000, indent: true },
      { labelAr: 'تكلفة خدمات الفنادق',      labelEn: 'Cost of Hotel Services',          amount: -2_530_000, indent: true },
      { labelAr: 'إجمالي تكلفة الخدمات',     labelEn: 'Total Cost of Services',          amount: -11_930_000, bold: true, accent: 'red' },
    ],
  },
  {
    titleAr: 'إجمالي الربح', titleEn: 'Gross Profit',
    lines: [
      { labelAr: 'إجمالي الربح', labelEn: 'Gross Profit', amount: 9_070_000, bold: true, accent: 'emerald' },
      { labelAr: 'هامش الربح الإجمالي', labelEn: 'Gross Margin', amount: 43, bold: false },
    ],
  },
  {
    titleAr: 'المصروفات التشغيلية', titleEn: 'Operating Expenses',
    lines: [
      { labelAr: 'رواتب وأجور',           labelEn: 'Salaries & Wages',          amount: -2_400_000, indent: true },
      { labelAr: 'إيجار المكتب',           labelEn: 'Office Rent',               amount: -600_000,   indent: true },
      { labelAr: 'تسويق وإعلان',           labelEn: 'Marketing & Advertising',   amount: -320_000,   indent: true },
      { labelAr: 'مصاريف إدارية',         labelEn: 'General & Administrative',  amount: -220_000,   indent: true },
      { labelAr: 'عمولات بنكية ورسوم GDS', labelEn: 'Bank & GDS Fees',          amount: -96_000,    indent: true },
      { labelAr: 'إجمالي المصروفات التشغيلية', labelEn: 'Total Operating Expenses', amount: -3_636_000, bold: true, accent: 'red' },
    ],
  },
  {
    titleAr: 'النتيجة التشغيلية', titleEn: 'Operating Result',
    lines: [
      { labelAr: 'صافي الربح التشغيلي (EBIT)', labelEn: 'Net Operating Profit (EBIT)', amount: 5_434_000, bold: true, accent: 'emerald' },
      { labelAr: 'هامش الربح الصافي', labelEn: 'Net Profit Margin', amount: 25, bold: false },
    ],
  },
];

// ── VAT Return (ZATCA) ────────────────────────────────────────────────────────

const VAT_BOXES: VATBox[] = [
  // ── Output VAT (Sales)
  {
    box: '1',
    labelAr: 'الإمدادات الخاضعة للضريبة بالسعر القياسي (15%)',
    labelEn: 'Standard Rated Domestic Supplies (15%)',
    noteAr: 'الباقات السياحية الداخلية، الفنادق داخل المملكة، خدمات النقل، التأمين، عمولات الوكيل المحلية، رسوم الخدمة',
    noteEn: 'Domestic packages, hotels in KSA, transfers, insurance, domestic agent commissions, service fees',
    base: 11_550_000, vat: 1_732_500, rate: '15%', highlight: 'output',
  },
  {
    box: '2',
    labelAr: 'الإمدادات الخاضعة للضريبة بالسعر الصفري (0%)',
    labelEn: 'Zero-Rated Supplies (0%)',
    noteAr: 'تذاكر الطيران الدولية (نموذج أصيل)، الفنادق خارج المملكة، خدمات مُصدَّرة خارج نطاق الضريبة',
    noteEn: 'International air tickets (principal model), hotels outside KSA, exported services',
    base: 5_200_000, vat: 0, rate: '0%', highlight: 'output',
  },
  {
    box: '3',
    labelAr: 'الإمدادات المعفاة من الضريبة',
    labelEn: 'Exempt Supplies',
    noteAr: 'الجزء الديني من برامج العمرة والحج المؤهلة — يُعفى بموجب اللوائح الضريبية للأنشطة الدينية',
    noteEn: 'Religious portion of qualifying Umrah & Hajj programs — exempt under religious services rules',
    base: 4_250_000, vat: 0, rate: 'exempt', highlight: 'output',
  },
  {
    box: '4',
    labelAr: 'البضائع المستوردة خاضعة للضريبة',
    labelEn: 'Taxable Goods Imported',
    noteAr: 'بضائع مستوردة خاضعة لضريبة القيمة المضافة — عادةً لا تنطبق على وكالات السفر',
    noteEn: 'Imported goods subject to VAT — typically not applicable to travel agencies',
    base: 0, vat: 0, highlight: 'output',
  },
  {
    box: '5',
    labelAr: 'الخدمات المستوردة (الاستحقاق العكسي)',
    labelEn: 'Imported Services (Reverse Charge)',
    noteAr: 'رسوم اشتراك GDS الدولية (Amadeus, Sabre) واشتراكات البرامج الأجنبية',
    noteEn: 'International GDS subscriptions (Amadeus, Sabre) and foreign software subscriptions',
    base: 96_000, vat: 14_400, rate: 'reverse', highlight: 'output',
  },
  {
    box: '6',
    labelAr: 'إجمالي المبيعات (1+2+3+4+5)',
    labelEn: 'Total Sales (1+2+3+4+5)',
    noteAr: 'الإجمالي الكلي لجميع الإمدادات',
    noteEn: 'Grand total of all supplies',
    base: 21_096_000, vat: 1_746_900, highlight: 'output',
  },
  // ── Input VAT (Purchases)
  {
    box: '7',
    labelAr: 'المشتريات الخاضعة للضريبة القياسية (15%)',
    labelEn: 'Standard Rated Domestic Purchases (15%)',
    noteAr: 'تكاليف الباقات والفنادق المحلية والمكاتب والمصاريف التشغيلية مع فاتورة ضريبية معتمدة',
    noteEn: 'Package costs, domestic hotels, office expenses with valid tax invoices',
    base: 3_300_000, vat: 495_000, highlight: 'input',
  },
  {
    box: '8',
    labelAr: 'المشتريات الخاضعة للضريبة الصفرية',
    labelEn: 'Zero-Rated Purchases',
    noteAr: 'تذاكر طيران دولية مشتراة من موردين بالسعر الصفري',
    noteEn: 'International air tickets purchased from suppliers at zero rate',
    base: 4_800_000, vat: 0, highlight: 'input',
  },
  {
    box: '9',
    labelAr: 'الواردات الخاضعة للضريبة',
    labelEn: 'Imports Subject to VAT',
    noteAr: 'الواردات المسجلة وفق الإقرار الجمركي',
    noteEn: 'Imports as per customs declaration',
    base: 0, vat: 0, highlight: 'input',
  },
  {
    box: '10',
    labelAr: 'إجمالي المشتريات (7+8+9)',
    labelEn: 'Total Purchases (7+8+9)',
    noteAr: 'الإجمالي الكلي للمشتريات والمدخلات',
    noteEn: 'Grand total of all purchases and inputs',
    base: 8_100_000, vat: 495_000, highlight: 'input',
  },
  // ── Net VAT
  {
    box: '11',
    labelAr: 'إجمالي ضريبة المبيعات المستحقة',
    labelEn: 'Total Output VAT Due',
    noteAr: 'مجموع ضريبة المخرجات من الخانات 1 و 5',
    noteEn: 'Sum of output VAT from boxes 1 and 5',
    base: 0, vat: 1_746_900, highlight: 'net-due',
  },
  {
    box: '12',
    labelAr: 'إجمالي ضريبة المدخلات المؤهلة للخصم',
    labelEn: 'Total Eligible Input VAT Deduction',
    noteAr: 'ضريبة المدخلات القابلة للاسترداد — يجب أن تكون مدعومة بفواتير ضريبية معتمدة',
    noteEn: 'Recoverable input VAT — must be backed by valid ZATCA-compliant tax invoices',
    base: 0, vat: 495_000, highlight: 'input',
  },
  {
    box: '13',
    labelAr: 'صافي الضريبة المستحقة (11 − 12)',
    labelEn: 'Net VAT Due (11 − 12)',
    noteAr: 'المبلغ المستحق للدفع لهيئة الزكاة والضريبة والجمارك',
    noteEn: 'Amount payable to ZATCA',
    base: 0, vat: 1_251_900, highlight: 'net-due',
  },
];

// ── Balance Sheet ─────────────────────────────────────────────────────────────

interface BSLine {
  code?: string;
  labelAr: string;
  labelEn: string;
  amount: number;
  indent?: boolean;
  bold?: boolean;
  separator?: boolean;
  accent?: 'brand' | 'red' | 'purple' | 'emerald' | 'slate';
}

interface BSSection {
  titleAr: string;
  titleEn: string;
  color: string;
  lines: BSLine[];
  total: number;
}

const BALANCE_SHEET: BSSection[] = [
  {
    titleAr: 'الأصول المتداولة', titleEn: 'Current Assets', color: 'bg-brand-50 border-brand-200 text-brand-700',
    total: 9_330_000,
    lines: [
      { code: '1110', labelAr: 'البنك — الحساب الجاري',      labelEn: 'Bank — Current Account',            amount: 8_740_000, indent: true },
      { code: '1111', labelAr: 'الصندوق — نقدية',             labelEn: 'Cash on Hand',                      amount: 600_000,   indent: true },
      { code: '1120', labelAr: 'ذمم مدينة — عملاء',           labelEn: 'Accounts Receivable',               amount: 4_530_000, indent: true },
      { code: '1130', labelAr: 'مصاريف مدفوعة مقدماً',       labelEn: 'Prepaid Expenses',                  amount: 360_000,   indent: true },
      { labelAr: 'إجمالي الأصول المتداولة',                   labelEn: 'Total Current Assets',               amount: 14_230_000, bold: true, accent: 'brand' },
    ],
  },
  {
    titleAr: 'الأصول غير المتداولة', titleEn: 'Non-Current Assets', color: 'bg-sky-50 border-sky-200 text-sky-700',
    total: 1_200_000,
    lines: [
      { code: '1210', labelAr: 'أصول ثابتة — أجهزة وأثاث',   labelEn: 'Fixed Assets — Equipment & Furniture', amount: 1_200_000, indent: true },
      { code: '1220', labelAr: 'مجمّع الإهلاك',               labelEn: 'Accumulated Depreciation',           amount: -240_000,  indent: true },
      { labelAr: 'إجمالي الأصول غير المتداولة',              labelEn: 'Total Non-Current Assets',           amount: 960_000, bold: true, accent: 'brand' },
    ],
  },
  {
    titleAr: 'إجمالي الأصول', titleEn: 'TOTAL ASSETS', color: 'bg-brand-600 border-brand-700 text-white',
    total: 15_190_000,
    lines: [
      { labelAr: 'إجمالي الأصول', labelEn: 'TOTAL ASSETS', amount: 15_190_000, bold: true },
    ],
  },
  {
    titleAr: 'الخصوم المتداولة', titleEn: 'Current Liabilities', color: 'bg-red-50 border-red-200 text-red-700',
    total: 3_202_000,
    lines: [
      { code: '2110', labelAr: 'ذمم دائنة — موردون',          labelEn: 'Accounts Payable — Suppliers',     amount: 3_200_000, indent: true },
      { code: '2310', labelAr: 'ضريبة القيمة المضافة مستحقة', labelEn: 'VAT Payable',                      amount: 1_102_000, indent: true },
      { code: '2320', labelAr: 'دفعات مقدمة من العملاء',      labelEn: 'Customer Deposits / Advances',     amount: 480_000,   indent: true },
      { labelAr: 'إجمالي الخصوم المتداولة',                   labelEn: 'Total Current Liabilities',        amount: 4_782_000, bold: true, accent: 'red' },
    ],
  },
  {
    titleAr: 'حقوق الملكية', titleEn: 'Equity', color: 'bg-purple-50 border-purple-200 text-purple-700',
    total: 10_408_000,
    lines: [
      { code: '3110', labelAr: 'رأس المال المدفوع',             labelEn: 'Paid-in Capital',                  amount: 5_000_000, indent: true },
      { code: '3120', labelAr: 'أرباح محتجزة — فترات سابقة',   labelEn: 'Retained Earnings',                amount: 4_756_000, indent: true },
      { code: '3130', labelAr: 'صافي ربح الفترة الحالية',       labelEn: 'Net Profit — Current Period',      amount: 5_434_000, indent: true, accent: 'emerald' },
      { labelAr: 'توزيعات أرباح',                               labelEn: 'Dividends Paid',                   amount: -2_000_000, indent: true },
      { labelAr: 'إجمالي حقوق الملكية',                         labelEn: 'Total Equity',                     amount: 10_408_000, bold: true, accent: 'purple' },
    ],
  },
  {
    titleAr: 'إجمالي الخصوم وحقوق الملكية', titleEn: 'TOTAL LIABILITIES & EQUITY', color: 'bg-purple-700 border-purple-800 text-white',
    total: 15_190_000,
    lines: [
      { labelAr: 'إجمالي الخصوم وحقوق الملكية', labelEn: 'TOTAL LIABILITIES & EQUITY', amount: 15_190_000, bold: true },
    ],
  },
];

// ── Profitability Data ────────────────────────────────────────────────────────

interface ServiceProfit {
  nameAr: string;
  nameEn: string;
  color: string;
  bookings: number;
  revenueH: number;
  costH: number;
}

const SERVICE_PROFIT: ServiceProfit[] = [
  { nameAr: 'عمرة وحج',      nameEn: 'Umrah & Hajj',   color: 'bg-brand-500',   bookings: 62,  revenueH: 8_500_000, costH: 6_200_000 },
  { nameAr: 'طيران',         nameEn: 'Flights',         color: 'bg-sky-500',     bookings: 48,  revenueH: 3_200_000, costH: 0 },
  { nameAr: 'باقات سياحية',  nameEn: 'Tour Packages',  color: 'bg-emerald-500', bookings: 35,  revenueH: 4_500_000, costH: 3_200_000 },
  { nameAr: 'فنادق',         nameEn: 'Hotels',          color: 'bg-amber-500',   bookings: 29,  revenueH: 3_250_000, costH: 2_530_000 },
  { nameAr: 'تأشيرات',       nameEn: 'Visas',           color: 'bg-red-400',     bookings: 56,  revenueH: 1_550_000, costH: 0 },
  { nameAr: 'تأمين سفر',     nameEn: 'Travel Insurance',color: 'bg-rose-400',    bookings: 34,  revenueH: 420_000,   costH: 0 },
  { nameAr: 'نقل',           nameEn: 'Transfers',       color: 'bg-violet-400',  bookings: 18,  revenueH: 180_000,   costH: 0 },
];

interface AgentStat {
  nameAr: string;
  nameEn: string;
  bookings: number;
  revenueH: number;
  commH: number;
  convPct: number;
}

const AGENT_STATS: AgentStat[] = [
  { nameAr: 'أحمد المحمد',   nameEn: 'Ahmad Al-Muhammad', bookings: 74, revenueH: 8_120_000, commH: 520_000, convPct: 88 },
  { nameAr: 'سارة القحطاني', nameEn: 'Sara Al-Qahtani',   bookings: 58, revenueH: 6_340_000, commH: 420_000, convPct: 82 },
  { nameAr: 'خالد العتيبي',  nameEn: 'Khalid Al-Otaibi',  bookings: 41, revenueH: 4_500_000, commH: 310_000, convPct: 79 },
  { nameAr: 'نورة الدوسري',  nameEn: 'Noura Al-Dosari',   bookings: 33, revenueH: 3_620_000, commH: 255_000, convPct: 75 },
  { nameAr: 'فهد الشهري',    nameEn: 'Fahad Al-Shehri',   bookings: 28, revenueH: 2_820_000, commH: 198_000, convPct: 71 },
];

interface TopCustomer {
  nameAr: string;
  nameEn: string;
  bookings: number;
  totalH: number;
  lastServiceAr: string;
  lastServiceEn: string;
}

const TOP_CUSTOMERS: TopCustomer[] = [
  { nameAr: 'شركة الأمانة للسفر',    nameEn: 'Al-Amana Travel Co.',      bookings: 18, totalH: 3_240_000, lastServiceAr: 'باقة سياحية',  lastServiceEn: 'Tour Package' },
  { nameAr: 'مجموعة نجم للأعمال',    nameEn: 'Najm Business Group',      bookings: 14, totalH: 2_870_000, lastServiceAr: 'طيران',         lastServiceEn: 'Flight' },
  { nameAr: 'عبد الرحمن السلمان',    nameEn: 'Abdulrahman Al-Salman',    bookings: 12, totalH: 1_980_000, lastServiceAr: 'عمرة وحج',      lastServiceEn: 'Umrah & Hajj' },
  { nameAr: 'شركة الرواد للمقاولات', nameEn: 'Al-Rowad Contracting',     bookings: 9,  totalH: 1_640_000, lastServiceAr: 'فنادق',         lastServiceEn: 'Hotel' },
  { nameAr: 'د. هند الزهراني',       nameEn: 'Dr. Hind Al-Zahrani',      bookings: 8,  totalH: 1_340_000, lastServiceAr: 'تأشيرة',        lastServiceEn: 'Visa' },
];

const PERIODS: { id: Period; labelAr: string; labelEn: string }[] = [
  { id: 'q1', labelAr: 'الربع الأول 2026 (يناير–مارس)', labelEn: 'Q1 2026 (Jan–Mar)' },
  { id: 'q2', labelAr: 'الربع الثاني 2026 (أبريل–يونيو)', labelEn: 'Q2 2026 (Apr–Jun)' },
  { id: 'h1', labelAr: 'النصف الأول 2026 (يناير–يونيو)', labelEn: 'H1 2026 (Jan–Jun)' },
  { id: 'fy', labelAr: 'السنة الكاملة 2026', labelEn: 'Full Year 2026' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function closingDebit(a: TrialAccount)  { return Math.max(0, a.openDebit  + a.mvtDebit  - a.openCredit - a.mvtCredit); }
function closingCredit(a: TrialAccount) { return Math.max(0, a.openCredit + a.mvtCredit - a.openDebit  - a.mvtDebit); }

const CATEGORY_META: Record<TrialAccount['category'], { labelAr: string; labelEn: string; borderColor: string; textColor: string; bgColor: string }> = {
  asset:     { labelAr: 'الأصول',           labelEn: 'Assets',          borderColor: 'border-brand-300',   textColor: 'text-brand-700',   bgColor: 'bg-brand-50' },
  liability: { labelAr: 'الخصوم',           labelEn: 'Liabilities',     borderColor: 'border-red-300',     textColor: 'text-red-700',     bgColor: 'bg-red-50' },
  equity:    { labelAr: 'حقوق الملكية',     labelEn: 'Equity',          borderColor: 'border-purple-300',  textColor: 'text-purple-700',  bgColor: 'bg-purple-50' },
  revenue:   { labelAr: 'الإيرادات',        labelEn: 'Revenue',         borderColor: 'border-emerald-300', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  expense:   { labelAr: 'المصروفات',        labelEn: 'Expenses',        borderColor: 'border-amber-300',   textColor: 'text-amber-700',   bgColor: 'bg-amber-50' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, iconBg, iconColor, label, value, sub, trend }: {
  icon: ReactNode; iconBg: string; iconColor: string; label: string;
  value: string | number; sub?: string; trend?: { pct: number; up: boolean };
}) {
  return (
    <Card className="flex items-start gap-4">
      <div className={cn('p-3 rounded-xl flex-shrink-0', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900 tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full',
            trend.up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
            {trend.up ? '↑' : '↓'} {trend.pct}%
          </span>
        )}
      </div>
    </Card>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const totalRev  = MONTHLY.reduce((s, m) => s + m.rev, 0);
  const totalCost = MONTHLY.reduce((s, m) => s + m.cost, 0);
  const totalVat  = MONTHLY.reduce((s, m) => s + m.vat, 0);
  const totalBook = MONTHLY.reduce((s, m) => s + m.bookings, 0);
  const netProfit = totalRev - totalCost - 3_636_000;
  const maxRev    = Math.max(...MONTHLY.map(m => m.rev));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
          value={formatCurrency(totalRev, fmtLocale)}
          trend={{ pct: 23, up: true }} sub={isAr ? 'صافي من الضريبة' : 'Excl. VAT'} />
        <KpiCard icon={<BarChart3 size={20} />} iconBg="bg-sky-50" iconColor="text-sky-600"
          label={isAr ? 'إجمالي الحجوزات' : 'Total Bookings'}
          value={formatCount(totalBook, fmtLocale)}
          trend={{ pct: 18, up: true }} sub={isAr ? 'جميع الخدمات' : 'All services'} />
        <KpiCard icon={<Wallet size={20} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label={isAr ? 'صافي الربح' : 'Net Profit'}
          value={formatCurrency(netProfit, fmtLocale)}
          trend={{ pct: 29, up: true }} sub={isAr ? 'هامش 25%' : '25% margin'} />
        <KpiCard icon={<Receipt size={20} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'ضريبة محصّلة' : 'VAT Collected'}
          value={formatCurrency(totalVat, fmtLocale)}
          sub={isAr ? 'صافي المستحق لهيئة الزكاة' : 'Net due to ZATCA'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly bar chart */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'الإيرادات الشهرية' : 'Monthly Revenue'}</h2>
            <span className="text-xs text-slate-400">{isAr ? 'يناير — مايو 2026' : 'Jan – May 2026'}</span>
          </div>
          <div className="space-y-3.5">
            {MONTHLY.map(m => {
              const widthPct = Math.round((m.rev / maxRev) * 100);
              const profitPct = Math.round(((m.rev - m.cost) / m.rev) * 100);
              return (
                <div key={m.nameEn} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-slate-500 flex-shrink-0 text-end font-medium">
                    {isAr ? m.nameAr : m.nameEn}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full flex items-center justify-end pe-3 transition-all duration-700"
                      style={{ width: `${widthPct}%` }}
                    >
                      <span className="text-xs font-semibold text-white whitespace-nowrap">
                        {m.bookings} {isAr ? 'حجز' : 'bk'}
                      </span>
                    </div>
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <p className="text-xs font-bold text-slate-900 tabular-nums">{formatCurrency(m.rev, fmtLocale)}</p>
                    <p className="text-[10px] text-emerald-600 font-medium">+{profitPct}% {isAr ? 'هامش' : 'margin'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Service type mix */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'توزيع الإيرادات حسب الخدمة' : 'Revenue by Service Type'}</h2>
          </div>
          <div className="space-y-3">
            {TYPE_MIX.map(t => (
              <div key={t.nameEn}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', t.dot)} />
                    {isAr ? t.nameAr : t.nameEn}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold tabular-nums text-slate-900">{formatCurrency(t.rev, fmtLocale)}</span>
                    <span className="text-xs text-slate-400 w-8 text-end">{t.pct}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={cn('h-2 rounded-full transition-all duration-700', t.color)} style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-5 pt-4 border-t border-surface-border flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">{isAr ? 'الإجمالي' : 'Total'}</span>
            <span className="text-sm font-bold text-brand-700 tabular-nums">{formatCurrency(totalRev, fmtLocale)}</span>
          </div>
        </Card>
      </div>

      {/* Detailed monthly table */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-surface-border">
          <h2 className="text-base font-semibold text-slate-900">{isAr ? 'التقرير الشهري التفصيلي' : 'Detailed Monthly Report'}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                {[
                  { label: isAr ? 'الشهر' : 'Month', align: 'start ps-6' },
                  { label: isAr ? 'الحجوزات' : 'Bookings', align: 'end' },
                  { label: isAr ? 'الإيرادات (قبل VAT)' : 'Revenue (excl. VAT)', align: 'end' },
                  { label: isAr ? 'تكلفة الخدمات' : 'Cost of Services', align: 'end' },
                  { label: isAr ? 'إجمالي الربح' : 'Gross Profit', align: 'end' },
                  { label: isAr ? 'ضريبة VAT' : 'VAT', align: 'end pe-6' },
                ].map((col, i) => (
                  <th key={i} className={`text-${col.align} py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {MONTHLY.map(m => {
                const gross = m.rev - m.cost;
                const grossPct = Math.round((gross / m.rev) * 100);
                return (
                  <tr key={m.nameEn} className="hover:bg-slate-50/60 transition-colors">
                    <td className="ps-6 py-3.5 font-semibold text-slate-900">{isAr ? m.nameAr : m.nameEn}</td>
                    <td className="py-3.5 text-end text-slate-700 tabular-nums">{formatCount(m.bookings, fmtLocale)}</td>
                    <td className="py-3.5 text-end font-mono tabular-nums text-slate-800">{formatCurrency(m.rev, fmtLocale)}</td>
                    <td className="py-3.5 text-end font-mono tabular-nums text-red-600">({formatCurrency(m.cost, fmtLocale)})</td>
                    <td className="py-3.5 text-end">
                      <span className="font-mono tabular-nums font-semibold text-emerald-700">{formatCurrency(gross, fmtLocale)}</span>
                      <span className="text-[10px] text-slate-400 ms-1">{grossPct}%</span>
                    </td>
                    <td className="pe-6 py-3.5 text-end font-mono tabular-nums text-amber-700">{formatCurrency(m.vat, fmtLocale)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="ps-6 py-3.5 font-bold text-slate-900">{isAr ? 'الإجمالي' : 'Total'}</td>
                <td className="py-3.5 text-end font-bold text-slate-900 tabular-nums">{formatCount(totalBook, fmtLocale)}</td>
                <td className="py-3.5 text-end font-bold font-mono tabular-nums text-brand-700">{formatCurrency(totalRev, fmtLocale)}</td>
                <td className="py-3.5 text-end font-bold font-mono tabular-nums text-red-600">({formatCurrency(totalCost, fmtLocale)})</td>
                <td className="py-3.5 text-end font-bold font-mono tabular-nums text-emerald-700">{formatCurrency(totalRev - totalCost, fmtLocale)}</td>
                <td className="pe-6 py-3.5 text-end font-bold font-mono tabular-nums text-amber-700">{formatCurrency(totalVat, fmtLocale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Trial Balance Tab ─────────────────────────────────────────────────────────

function TrialBalanceTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const [expanded, setExpanded] = useState<Set<TrialAccount['category']>>(new Set<TrialAccount['category']>(['asset', 'liability', 'equity', 'revenue', 'expense']));

  const toggleCat = (c: TrialAccount['category']) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(c) ? next.delete(c) : next.add(c);
    return next;
  });

  const cats: TrialAccount['category'][] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  const totalOpenDebit   = TRIAL_ACCOUNTS.reduce((s, a) => s + a.openDebit, 0);
  const totalOpenCredit  = TRIAL_ACCOUNTS.reduce((s, a) => s + a.openCredit, 0);
  const totalMvtDebit    = TRIAL_ACCOUNTS.reduce((s, a) => s + a.mvtDebit, 0);
  const totalMvtCredit   = TRIAL_ACCOUNTS.reduce((s, a) => s + a.mvtCredit, 0);
  const totalCloseDebit  = TRIAL_ACCOUNTS.reduce((s, a) => s + closingDebit(a), 0);
  const totalCloseCredit = TRIAL_ACCOUNTS.reduce((s, a) => s + closingCredit(a), 0);
  const isBalanced = Math.abs(totalCloseDebit - totalCloseCredit) < 1;

  return (
    <div className="space-y-5">
      {/* Balance indicator */}
      <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold',
        isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800')}>
        {isBalanced ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        {isBalanced
          ? (isAr ? 'الميزان متوازن — المدين يساوي الدائن' : 'Trial Balance is balanced — Debit equals Credit')
          : (isAr ? 'تحذير: الميزان غير متوازن' : 'Warning: Trial balance is unbalanced')}
        <span className="ms-auto text-xs font-normal opacity-70">
          {isAr ? 'يناير — مايو 2026' : 'Jan – May 2026'}
        </span>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">{isAr ? 'الكود' : 'Code'}</th>
                <th className="text-start px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رصيد افتتاحي مدين' : 'Opening Debit'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رصيد افتتاحي دائن' : 'Opening Credit'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حركة مدين' : 'Period Debit'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حركة دائن' : 'Period Credit'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رصيد ختامي مدين' : 'Closing Debit'}</th>
                <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'رصيد ختامي دائن' : 'Closing Credit'}</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(cat => {
                const meta = CATEGORY_META[cat];
                const accounts = TRIAL_ACCOUNTS.filter(a => a.category === cat);
                const catOpenD  = accounts.reduce((s, a) => s + a.openDebit, 0);
                const catOpenC  = accounts.reduce((s, a) => s + a.openCredit, 0);
                const catMvtD   = accounts.reduce((s, a) => s + a.mvtDebit, 0);
                const catMvtC   = accounts.reduce((s, a) => s + a.mvtCredit, 0);
                const catCloseD = accounts.reduce((s, a) => s + closingDebit(a), 0);
                const catCloseC = accounts.reduce((s, a) => s + closingCredit(a), 0);
                const isOpen = expanded.has(cat);

                return (
                  <>
                    {/* Category header row */}
                    <tr
                      key={`cat-${cat}`}
                      className={cn('cursor-pointer hover:brightness-95 transition-all', meta.bgColor)}
                      onClick={() => toggleCat(cat)}
                    >
                      <td colSpan={2} className="ps-4 pe-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                          <span className={cn('text-sm font-bold', meta.textColor)}>
                            {isAr ? meta.labelAr : meta.labelEn}
                          </span>
                          <span className="text-xs text-slate-400 font-normal">({accounts.length})</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700 tabular-nums font-mono">{catOpenD  > 0 ? formatCurrency(catOpenD,  fmtLocale) : '—'}</td>
                      <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700 tabular-nums font-mono">{catOpenC  > 0 ? formatCurrency(catOpenC,  fmtLocale) : '—'}</td>
                      <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700 tabular-nums font-mono">{catMvtD   > 0 ? formatCurrency(catMvtD,   fmtLocale) : '—'}</td>
                      <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700 tabular-nums font-mono">{catMvtC   > 0 ? formatCurrency(catMvtC,   fmtLocale) : '—'}</td>
                      <td className="px-3 py-2.5 text-end text-sm font-bold tabular-nums font-mono text-slate-900">{catCloseD > 0 ? formatCurrency(catCloseD, fmtLocale) : '—'}</td>
                      <td className="pe-5 px-3 py-2.5 text-end text-sm font-bold tabular-nums font-mono text-slate-900">{catCloseC > 0 ? formatCurrency(catCloseC, fmtLocale) : '—'}</td>
                    </tr>

                    {/* Account rows */}
                    {isOpen && accounts.map(a => (
                      <tr key={a.code} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                        <td className="ps-5 pe-3 py-2.5">
                          <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{a.code}</span>
                        </td>
                        <td className="ps-6 pe-3 py-2.5 text-sm text-slate-700">{isAr ? a.nameAr : a.nameEn}</td>
                        <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{a.openDebit  > 0 ? formatCurrency(a.openDebit,  fmtLocale) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{a.openCredit > 0 ? formatCurrency(a.openCredit, fmtLocale) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{a.mvtDebit   > 0 ? formatCurrency(a.mvtDebit,   fmtLocale) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-end text-xs font-mono tabular-nums text-slate-600">{a.mvtCredit  > 0 ? formatCurrency(a.mvtCredit,  fmtLocale) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{closingDebit(a)  > 0 ? formatCurrency(closingDebit(a),  fmtLocale) : <span className="text-slate-300">—</span>}</td>
                        <td className="pe-5 px-3 py-2.5 text-end text-sm font-mono tabular-nums font-semibold text-slate-900">{closingCredit(a) > 0 ? formatCurrency(closingCredit(a), fmtLocale) : <span className="text-slate-300">—</span>}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td colSpan={2} className="ps-5 pe-3 py-3.5">
                  <span className="text-sm font-black text-slate-900 uppercase tracking-wide">{isAr ? 'الإجمالي الكلي' : 'Grand Total'}</span>
                </td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(totalOpenDebit,   fmtLocale)}</td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(totalOpenCredit,  fmtLocale)}</td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(totalMvtDebit,    fmtLocale)}</td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-slate-900">{formatCurrency(totalMvtCredit,   fmtLocale)}</td>
                <td className="px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-brand-700">{formatCurrency(totalCloseDebit,  fmtLocale)}</td>
                <td className="pe-5 px-3 py-3.5 text-end text-sm font-black tabular-nums font-mono text-brand-700">{formatCurrency(totalCloseCredit, fmtLocale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Income Statement Tab ─────────────────────────────────────────────────────

function IncomeStatementTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const GROSS_MARGIN = 43;
  const NET_MARGIN   = 25;

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={18} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
          value={formatCurrency(21_000_000, fmtLocale)} />
        <KpiCard icon={<Scale size={18} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label={isAr ? 'إجمالي الربح' : 'Gross Profit'}
          value={formatCurrency(9_070_000, fmtLocale)}
          sub={`${GROSS_MARGIN}% ${isAr ? 'هامش' : 'margin'}`} />
        <KpiCard icon={<TrendingUp size={18} />} iconBg="bg-sky-50" iconColor="text-sky-600"
          label={isAr ? 'صافي الربح' : 'Net Profit'}
          value={formatCurrency(5_434_000, fmtLocale)}
          sub={`${NET_MARGIN}% ${isAr ? 'هامش' : 'margin'}`} />
        <KpiCard icon={<TrendingDown size={18} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label={isAr ? 'إجمالي المصروفات' : 'Total Expenses'}
          value={formatCurrency(15_566_000, fmtLocale)} />
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'قائمة الدخل (الأرباح والخسائر)' : 'Income Statement (Profit & Loss)'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{isAr ? 'يناير — مايو 2026' : 'January – May 2026'}</p>
          </div>
          <button className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
            <Printer size={13} />{isAr ? 'طباعة' : 'Print'}
          </button>
        </div>

        <div className="divide-y divide-surface-border">
          {PL_SECTIONS.map((section, si) => (
            <div key={si}>
              {/* Section header */}
              <div className="px-6 py-2 bg-slate-50">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  {isAr ? section.titleAr : section.titleEn}
                </span>
              </div>

              {/* Lines */}
              {section.lines.map((line, li) => {
                const isMargin = line.labelAr.includes('هامش');
                const displayValue = isMargin
                  ? `${line.amount}%`
                  : formatCurrency(Math.abs(line.amount), fmtLocale);
                const isNegative = line.amount < 0;

                return (
                  <div key={li} className={cn(
                    'flex items-center justify-between px-6 py-3 transition-colors',
                    !line.bold && 'hover:bg-slate-50/60',
                    line.bold && 'bg-white',
                  )}>
                    <span className={cn(
                      'text-sm',
                      line.indent ? 'ps-4 text-slate-600' : 'text-slate-800',
                      line.bold && 'font-bold text-slate-900',
                    )}>
                      {isAr ? line.labelAr : line.labelEn}
                    </span>
                    <span className={cn(
                      'tabular-nums font-mono text-sm',
                      line.bold ? 'font-black' : 'font-medium',
                      !line.accent && !isNegative && 'text-slate-800',
                      !line.accent && isNegative && 'text-red-600',
                      line.accent === 'emerald' && 'text-emerald-700',
                      line.accent === 'red' && 'text-red-600',
                      line.accent === 'brand' && 'text-brand-700',
                      line.accent === 'amber' && 'text-amber-700',
                    )}>
                      {isMargin ? displayValue : (isNegative ? `(${displayValue})` : displayValue)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Net Profit footer */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-50 to-white border-t-2 border-emerald-300 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mb-1">
              {isAr ? 'صافي الربح النهائي' : 'NET PROFIT'}
            </p>
            <p className="text-xs text-emerald-600">{isAr ? 'هامش الربح الصافي 25%' : '25% Net Profit Margin'}</p>
          </div>
          <p className="text-3xl font-black text-emerald-700 tabular-nums">{formatCurrency(5_434_000, fmtLocale)}</p>
        </div>
      </Card>
    </div>
  );
}

// ─── VAT Return Tab ───────────────────────────────────────────────────────────

function VATReturnTab({ isAr, fmtLocale, period, onPeriodChange }: {
  isAr: boolean; fmtLocale: string; period: Period; onPeriodChange: (p: Period) => void;
}) {
  const outputBoxes = VAT_BOXES.filter(b => b.highlight === 'output');
  const inputBoxes  = VAT_BOXES.filter(b => b.highlight === 'input');
  const netBoxes    = VAT_BOXES.filter(b => b.highlight === 'net-due');
  const netVAT      = VAT_BOXES.find(b => b.box === '13')!;

  function BoxRow({ b }: { b: VATBox }) {
    const rateBadgeMap: Record<string, string> = {
      '15%':     'bg-red-100 text-red-700',
      '0%':      'bg-sky-100 text-sky-700',
      'exempt':  'bg-slate-100 text-slate-500',
      'reverse': 'bg-purple-100 text-purple-700',
    };
    const rateBadge = b.rate ? (rateBadgeMap[b.rate] ?? '') : '';

    return (
      <div className="border-b border-slate-100 last:border-0">
        <div className="grid grid-cols-12 gap-0 items-start">
          {/* Box number */}
          <div className="col-span-1 flex items-start justify-center pt-4 pb-3">
            <span className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black',
              b.highlight === 'output' ? 'bg-brand-600 text-white' :
              b.highlight === 'input'  ? 'bg-slate-600 text-white' :
              'bg-emerald-600 text-white',
            )}>{b.box}</span>
          </div>

          {/* Label + note */}
          <div className="col-span-7 px-4 py-3.5">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 flex-1">
                {isAr ? b.labelAr : b.labelEn}
              </p>
              {b.rate && (
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0', rateBadge)}>
                  {b.rate}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              {isAr ? b.noteAr : b.noteEn}
            </p>
          </div>

          {/* Base amount */}
          <div className="col-span-2 px-3 py-3.5 text-end border-s border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 mb-1">{isAr ? 'الوعاء الضريبي' : 'Tax Base'}</p>
            <p className="text-sm font-mono tabular-nums font-semibold text-slate-800">
              {b.base > 0 ? formatCurrency(b.base, fmtLocale) : <span className="text-slate-300">—</span>}
            </p>
          </div>

          {/* VAT amount */}
          <div className={cn('col-span-2 px-3 py-3.5 text-end border-s border-slate-100',
            b.highlight === 'net-due' && b.box === '13' && 'bg-emerald-50')}>
            <p className="text-[10px] font-semibold text-slate-400 mb-1">{isAr ? 'مبلغ الضريبة' : 'VAT Amount'}</p>
            <p className={cn('text-sm font-mono tabular-nums font-bold',
              b.box === '13' ? 'text-emerald-700 text-base' : 'text-slate-900')}>
              {b.vat > 0 ? formatCurrency(b.vat, fmtLocale) : <span className="text-slate-300">—</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  function Section({ title, boxes, accentBg, accentBorder }: {
    title: string; boxes: VATBox[]; accentBg: string; accentBorder: string;
  }) {
    return (
      <div className={cn('rounded-xl border overflow-hidden', accentBorder)}>
        <div className={cn('px-5 py-3', accentBg)}>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">{title}</h3>
        </div>
        {boxes.map(b => <BoxRow key={b.box} b={b} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className={cn(
        'rounded-xl border-2 border-brand-200 bg-brand-50 px-5 py-4',
        'flex flex-col sm:flex-row sm:items-center gap-4',
      )}>
        <div className="flex items-center gap-2 text-brand-700 flex-1">
          <Stamp size={20} />
          <div>
            <p className="font-black text-base">{isAr ? 'إقرار ضريبة القيمة المضافة' : 'VAT Return — ZATCA'}</p>
            <p className="text-xs text-brand-600">{isAr ? 'متوافق مع هيئة الزكاة والضريبة والجمارك' : 'Compliant with Saudi ZATCA requirements'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-brand-600 flex-shrink-0" />
          <select
            value={period}
            onChange={e => onPeriodChange(e.target.value as Period)}
            className="border border-brand-200 rounded-lg px-3 py-2 text-sm font-semibold text-brand-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {PERIODS.map(p => (
              <option key={p.id} value={p.id}>{isAr ? p.labelAr : p.labelEn}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Output VAT section */}
      <Section
        title={isAr ? 'القسم الأول — المبيعات وضريبة المخرجات' : 'Part I — Sales & Output VAT'}
        boxes={outputBoxes}
        accentBg="bg-brand-50"
        accentBorder="border-brand-200"
      />

      {/* Input VAT section */}
      <Section
        title={isAr ? 'القسم الثاني — المشتريات وضريبة المدخلات' : 'Part II — Purchases & Input VAT'}
        boxes={inputBoxes}
        accentBg="bg-slate-50"
        accentBorder="border-slate-200"
      />

      {/* Net VAT section */}
      <Section
        title={isAr ? 'القسم الثالث — صافي الضريبة المستحقة' : 'Part III — Net VAT Due'}
        boxes={netBoxes}
        accentBg="bg-emerald-50"
        accentBorder="border-emerald-200"
      />

      {/* Summary + checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Net payable summary */}
        <Card>
          <h3 className="text-sm font-bold text-slate-900 mb-4">{isAr ? 'ملخص الإقرار' : 'Return Summary'}</h3>
          <div className="space-y-3">
            {[
              { labelAr: 'إجمالي ضريبة المخرجات',    labelEn: 'Total Output VAT',         amount: 1_746_900, color: 'text-red-600' },
              { labelAr: 'إجمالي ضريبة المدخلات',    labelEn: 'Total Input VAT (Deduct)',  amount: 495_000,   color: 'text-emerald-700' },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-slate-100 pb-3">
                <span className="text-slate-600">{isAr ? row.labelAr : row.labelEn}</span>
                <span className={cn('font-bold font-mono tabular-nums', row.color)}>
                  {formatCurrency(row.amount, fmtLocale)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <span className="text-base font-black text-slate-900">{isAr ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span>
              <span className="text-xl font-black text-emerald-700 tabular-nums font-mono">
                {formatCurrency(netVAT.vat, fmtLocale)}
              </span>
            </div>
          </div>

          <button className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors shadow-sm">
            <Stamp size={16} />
            {isAr ? 'تقديم الإقرار الضريبي' : 'Submit VAT Return'}
          </button>
          <p className="text-[10px] text-center text-slate-400 mt-2">
            {isAr ? 'سيتم ربط هذا القسم مع بوابة ZATCA عند تفعيل خاصية الإرسال الإلكتروني' : 'Will connect to ZATCA portal when e-filing is enabled'}
          </p>
        </Card>

        {/* ZATCA compliance checklist */}
        <Card>
          <h3 className="text-sm font-bold text-slate-900 mb-4">{isAr ? 'قائمة الامتثال الضريبي' : 'ZATCA Compliance Checklist'}</h3>
          <div className="space-y-2.5">
            {[
              { ok: true,  ar: 'جميع الفواتير تحتوي رقم ضريبي',              en: 'All invoices include VAT number' },
              { ok: true,  ar: 'الفواتير الضريبية الإلكترونية مفعّلة (e-Invoicing)', en: 'e-Invoicing (FATOORAH) enabled' },
              { ok: true,  ar: 'تمييز الإمدادات الصفرية عن الخاضعة للضريبة', en: 'Zero-rated vs standard rated correctly classified' },
              { ok: true,  ar: 'ضريبة الاستحقاق العكسي مُسجَّلة (GDS)',      en: 'Reverse charge on GDS fees recorded' },
              { ok: false, ar: 'إشعارات الاستحقاق قبل 30 يوماً من الموعد',   en: 'Filing reminder 30 days before deadline' },
              { ok: false, ar: 'ربط تلقائي مع بوابة ZATCA للتقديم الإلكتروني', en: 'Automatic ZATCA portal integration for e-filing' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                {item.ok
                  ? <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  : <AlertCircle  size={16} className="text-amber-500  flex-shrink-0 mt-0.5" />}
                <span className={cn('text-xs', item.ok ? 'text-slate-700' : 'text-amber-700')}>
                  {isAr ? item.ar : item.en}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Balance Sheet Tab ────────────────────────────────────────────────────────

function BalanceSheetTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const assetTotal    = 15_190_000;
  const liabTotal     = 4_782_000;
  const equityTotal   = 10_408_000;
  const checkAmount   = liabTotal + equityTotal;
  const balanced      = assetTotal === checkAmount;

  return (
    <div className="space-y-6">
      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { labelAr: 'إجمالي الأصول',            labelEn: 'Total Assets',           amount: assetTotal,  bg: 'bg-brand-600', text: 'text-white' },
          { labelAr: 'إجمالي الخصوم',            labelEn: 'Total Liabilities',      amount: liabTotal,   bg: 'bg-red-600',   text: 'text-white' },
          { labelAr: 'إجمالي حقوق الملكية',      labelEn: 'Total Equity',           amount: equityTotal, bg: 'bg-purple-600',text: 'text-white' },
        ].map(s => (
          <div key={s.labelEn} className={`${s.bg} ${s.text} rounded-2xl p-5 shadow-sm`}>
            <p className="text-xs font-bold uppercase tracking-widest opacity-75 mb-1">{isAr ? s.labelAr : s.labelEn}</p>
            <p className="text-2xl font-extrabold tabular-nums">{formatCurrency(s.amount, fmtLocale)}</p>
          </div>
        ))}
      </div>

      {/* Balance check */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        {balanced
          ? <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          : <AlertCircle  size={18} className="text-red-600 flex-shrink-0" />}
        <div>
          <p className={`text-sm font-bold ${balanced ? 'text-emerald-700' : 'text-red-700'}`}>
            {balanced
              ? (isAr ? 'الميزانية متوازنة — الأصول = الخصوم + حقوق الملكية' : 'Balance sheet balanced — Assets = Liabilities + Equity')
              : (isAr ? 'تحذير: الميزانية غير متوازنة' : 'Warning: Balance sheet is out of balance')}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAr ? `${formatCurrency(assetTotal, fmtLocale)} = ${formatCurrency(liabTotal, fmtLocale)} + ${formatCurrency(equityTotal, fmtLocale)}`
                  : `${formatCurrency(assetTotal, fmtLocale)} = ${formatCurrency(liabTotal, fmtLocale)} + ${formatCurrency(equityTotal, fmtLocale)}`}
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Assets side */}
        <div className="space-y-4">
          {BALANCE_SHEET.filter((_, i) => i < 3).map(section => (
            <Card key={section.titleEn} padding="none">
              <div className={`px-5 py-3 border-b ${section.color.replace('text-white', 'text-inherit')} flex items-center justify-between`}>
                <h3 className="text-sm font-bold">{isAr ? section.titleAr : section.titleEn}</h3>
                <span className="text-sm font-extrabold tabular-nums">{formatCurrency(section.total, fmtLocale)}</span>
              </div>
              <table className="w-full">
                <tbody>
                  {section.lines.map((line, idx) => (
                    <tr key={idx} className={cn(
                      'border-b border-slate-100 last:border-0',
                      line.bold ? 'bg-slate-50' : 'hover:bg-slate-50/40',
                    )}>
                      <td className={cn('py-2.5 text-sm', line.indent ? 'ps-8 pe-4' : 'ps-4 pe-4')}>
                        {line.code && <span className="text-[10px] text-slate-400 font-mono me-2">{line.code}</span>}
                        <span className={cn(line.bold ? 'font-bold' : 'font-medium',
                          line.accent === 'brand' ? 'text-brand-700' : line.accent === 'emerald' ? 'text-emerald-700' : line.accent === 'purple' ? 'text-purple-700' : 'text-slate-700')}>
                          {isAr ? line.labelAr : line.labelEn}
                        </span>
                      </td>
                      <td className={cn('py-2.5 pe-5 text-end text-sm tabular-nums font-mono',
                        line.bold ? 'font-bold' : '',
                        line.accent === 'brand' ? 'text-brand-700' : line.accent === 'emerald' ? 'text-emerald-700' : line.accent === 'red' ? 'text-red-600' : line.amount < 0 ? 'text-red-500' : 'text-slate-800')}>
                        {line.amount !== 0 ? formatCurrency(Math.abs(line.amount), fmtLocale) : '—'}
                        {line.amount < 0 && <span className="text-[9px] ms-0.5 text-red-400">CR</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
        {/* Liabilities + Equity side */}
        <div className="space-y-4">
          {BALANCE_SHEET.filter((_, i) => i >= 3).map(section => (
            <Card key={section.titleEn} padding="none">
              <div className={`px-5 py-3 border-b ${section.color.replace('text-white', 'text-inherit')} flex items-center justify-between`}>
                <h3 className="text-sm font-bold">{isAr ? section.titleAr : section.titleEn}</h3>
                <span className="text-sm font-extrabold tabular-nums">{formatCurrency(section.total, fmtLocale)}</span>
              </div>
              <table className="w-full">
                <tbody>
                  {section.lines.map((line, idx) => (
                    <tr key={idx} className={cn(
                      'border-b border-slate-100 last:border-0',
                      line.bold ? 'bg-slate-50' : 'hover:bg-slate-50/40',
                    )}>
                      <td className={cn('py-2.5 text-sm', line.indent ? 'ps-8 pe-4' : 'ps-4 pe-4')}>
                        {line.code && <span className="text-[10px] text-slate-400 font-mono me-2">{line.code}</span>}
                        <span className={cn(line.bold ? 'font-bold' : 'font-medium',
                          line.accent === 'red' ? 'text-red-700' : line.accent === 'purple' ? 'text-purple-700' : line.accent === 'emerald' ? 'text-emerald-700' : 'text-slate-700')}>
                          {isAr ? line.labelAr : line.labelEn}
                        </span>
                      </td>
                      <td className={cn('py-2.5 pe-5 text-end text-sm tabular-nums font-mono',
                        line.bold ? 'font-bold' : '',
                        line.accent === 'red' ? 'text-red-700' : line.accent === 'purple' ? 'text-purple-700' : line.accent === 'emerald' ? 'text-emerald-700' : line.amount < 0 ? 'text-red-500' : 'text-slate-800')}>
                        {line.amount !== 0 ? formatCurrency(Math.abs(line.amount), fmtLocale) : '—'}
                        {line.amount < 0 && <span className="text-[9px] ms-0.5 text-red-400">CR</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Profitability Tab ────────────────────────────────────────────────────────

function ProfitabilityTab({ isAr, fmtLocale }: { isAr: boolean; fmtLocale: string }) {
  const totalRev  = SERVICE_PROFIT.reduce((s, p) => s + p.revenueH, 0);
  const totalCost = SERVICE_PROFIT.reduce((s, p) => s + p.costH, 0);
  const totalGP   = totalRev - totalCost;
  const maxRev    = Math.max(...SERVICE_PROFIT.map(p => p.revenueH));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20} />} iconBg="bg-brand-50" iconColor="text-brand-600"
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'} value={formatCurrency(totalRev, fmtLocale)} />
        <KpiCard icon={<Receipt size={20} />} iconBg="bg-red-50" iconColor="text-red-600"
          label={isAr ? 'إجمالي التكاليف' : 'Total Costs'} value={formatCurrency(totalCost, fmtLocale)} />
        <KpiCard icon={<Wallet size={20} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label={isAr ? 'إجمالي الربح' : 'Gross Profit'} value={formatCurrency(totalGP, fmtLocale)}
          sub={`${Math.round((totalGP / totalRev) * 100)}% ${isAr ? 'هامش' : 'margin'}`} />
        <KpiCard icon={<Users size={20} />} iconBg="bg-purple-50" iconColor="text-purple-600"
          label={isAr ? 'أفضل وكيل' : 'Top Agent'} value={isAr ? AGENT_STATS[0].nameAr : AGENT_STATS[0].nameEn}
          sub={formatCurrency(AGENT_STATS[0].revenueH, fmtLocale)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* By Service */}
        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-5">{isAr ? 'الربحية حسب الخدمة' : 'Profitability by Service'}</h2>
          <div className="space-y-4">
            {SERVICE_PROFIT.sort((a, b) => (b.revenueH - b.costH) - (a.revenueH - a.costH)).map(s => {
              const gp        = s.revenueH - s.costH;
              const margin    = s.revenueH > 0 ? Math.round((gp / s.revenueH) * 100) : 100;
              const revWidth  = Math.round((s.revenueH / maxRev) * 100);
              return (
                <div key={s.nameEn}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.color}`} />
                      <span className="text-sm font-semibold text-slate-800">{isAr ? s.nameAr : s.nameEn}</span>
                      <span className="text-xs text-slate-400">({s.bookings} {isAr ? 'حجز' : 'bk'})</span>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <span className="text-sm font-bold tabular-nums text-slate-900 block">{formatCurrency(gp, fmtLocale)}</span>
                      <span className={`text-xs font-semibold ${margin >= 50 ? 'text-emerald-600' : margin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{margin}% {isAr ? 'هامش' : 'margin'}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${revWidth}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>{isAr ? 'إيرادات:' : 'Rev:'} {formatCurrency(s.revenueH, fmtLocale)}</span>
                    {s.costH > 0 && <span>{isAr ? 'تكلفة:' : 'Cost:'} {formatCurrency(s.costH, fmtLocale)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* By Agent */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-surface-border">
            <h2 className="text-base font-semibold text-slate-900">{isAr ? 'أداء الموظفين' : 'Agent Performance'}</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الموظف' : 'Agent'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حجوزات' : 'Bookings'}</th>
                <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'الإيرادات' : 'Revenue'}</th>
                <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'نسبة التحويل' : 'Conv. Rate'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {AGENT_STATS.map((a, idx) => (
                <tr key={a.nameEn} className="hover:bg-slate-50/40 transition-colors">
                  <td className="ps-5 pe-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{isAr ? a.nameAr : a.nameEn}</p>
                        <p className="text-xs text-slate-400">{formatCurrency(a.commH, fmtLocale)} {isAr ? 'عمولة' : 'commission'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-end">
                    <span className="text-sm font-bold tabular-nums text-slate-900">{formatCount(a.bookings, fmtLocale)}</span>
                  </td>
                  <td className="px-3 py-3 text-end hidden sm:table-cell">
                    <span className="text-sm tabular-nums font-mono text-slate-700">{formatCurrency(a.revenueH, fmtLocale)}</span>
                  </td>
                  <td className="pe-5 px-3 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${a.convPct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">{a.convPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Top Customers */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{isAr ? 'أفضل العملاء إيراداً' : 'Top Revenue Customers'}</h2>
          <span className="text-xs text-slate-400">{isAr ? 'مرتب حسب الإجمالي' : 'Sorted by total spend'}</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-surface-border">
              <th className="text-start ps-5 pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
              <th className="text-start pe-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
              <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'حجوزات' : 'Bookings'}</th>
              <th className="text-end px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'آخر خدمة' : 'Last Service'}</th>
              <th className="text-end pe-5 px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'الإجمالي' : 'Total'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {TOP_CUSTOMERS.map((c, idx) => (
              <tr key={c.nameEn} className="hover:bg-slate-50/40 transition-colors">
                <td className="ps-5 pe-3 py-3.5">
                  <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500')}>
                    {idx + 1}
                  </span>
                </td>
                <td className="pe-3 py-3.5">
                  <p className="text-sm font-semibold text-slate-900">{isAr ? c.nameAr : c.nameEn}</p>
                </td>
                <td className="px-3 py-3.5 text-end">
                  <span className="text-sm tabular-nums font-bold text-slate-800">{formatCount(c.bookings, fmtLocale)}</span>
                </td>
                <td className="px-3 py-3.5 text-end hidden md:table-cell">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg font-medium">{isAr ? c.lastServiceAr : c.lastServiceEn}</span>
                </td>
                <td className="pe-5 px-3 py-3.5 text-end">
                  <span className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(c.totalH, fmtLocale)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Monthly trend */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">{isAr ? 'الاتجاه الشهري — الإيرادات والتكاليف' : 'Monthly Trend — Revenue vs Costs'}</h2>
        </div>
        <div className="space-y-3">
          {MONTHLY.map(m => {
            const gpH    = m.rev - m.cost;
            const margin = Math.round((gpH / m.rev) * 100);
            const maxM   = Math.max(...MONTHLY.map(x => x.rev));
            const revW   = Math.round((m.rev / maxM) * 100);
            const costW  = Math.round((m.cost / maxM) * 100);
            return (
              <div key={m.nameEn} className="grid grid-cols-[80px_1fr_120px] gap-3 items-center">
                <span className="text-xs font-medium text-slate-500 text-end">{isAr ? m.nameAr : m.nameEn}</span>
                <div className="relative h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div className="absolute inset-y-0 start-0 bg-brand-500/20 rounded-lg transition-all" style={{ width: `${revW}%` }} />
                  <div className="absolute inset-y-0 start-0 bg-red-400/30 rounded-lg transition-all" style={{ width: `${costW}%` }} />
                  <div className="absolute inset-y-0 start-0 bg-emerald-500 rounded-lg transition-all h-1.5 top-1/2 -translate-y-1/2 ms-1" style={{ width: `calc(${revW}% - ${costW}%)` }} />
                </div>
                <div className="text-end">
                  <p className="text-xs font-bold tabular-nums text-slate-900">{formatCurrency(gpH, fmtLocale)}</p>
                  <p className={`text-[10px] font-semibold ${margin >= 40 ? 'text-emerald-600' : 'text-amber-600'}`}>{margin}% {isAr ? 'ربح' : 'profit'}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-surface-border">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-500/40" /><span className="text-xs text-slate-500">{isAr ? 'الإيرادات' : 'Revenue'}</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400/40" /><span className="text-xs text-slate-500">{isAr ? 'التكاليف' : 'Costs'}</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-500">{isAr ? 'إجمالي الربح' : 'Gross Profit'}</span></div>
        </div>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'trial' | 'pl' | 'vat' | 'bs' | 'profit';

export default function ReportsPage() {
  const locale  = useLocale();
  const isAr    = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [period, setPeriod] = useState<Period>('h1');

  const tabs: { id: TabId; labelAr: string; labelEn: string; icon: ReactNode; badge?: string }[] = [
    { id: 'overview', labelAr: 'نظرة عامة',           labelEn: 'Overview',           icon: <BarChart3  size={16} /> },
    { id: 'trial',    labelAr: 'ميزان المراجعة',       labelEn: 'Trial Balance',      icon: <Scale      size={16} /> },
    { id: 'pl',       labelAr: 'قائمة الدخل',          labelEn: 'Income Statement',   icon: <ListTree   size={16} /> },
    { id: 'bs',       labelAr: 'الميزانية العمومية',   labelEn: 'Balance Sheet',      icon: <Building2  size={16} /> },
    { id: 'profit',   labelAr: 'تحليل الربحية',        labelEn: 'Profitability',      icon: <PieChart   size={16} /> },
    { id: 'vat',      labelAr: 'الإقرار الضريبي',      labelEn: 'VAT Return',         icon: <Stamp      size={16} />, badge: 'ZATCA' },
  ];

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التقارير المالية' : 'Financial Reports'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? 'ميزان المراجعة، قائمة الدخل، الميزانية العمومية، تحليل الربحية، وإقرار ضريبة القيمة المضافة'
              : 'Trial Balance, P&L, Balance Sheet, Profitability Analysis, and ZATCA VAT Return'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
            <Printer size={14} />{isAr ? 'طباعة' : 'Print'}
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
            <Download size={14} />{isAr ? 'تصدير Excel' : 'Export Excel'}
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white font-medium">
            <FileText size={14} />{isAr ? 'تصدير PDF' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex items-center gap-1 border-b border-surface-border mb-6 overflow-x-auto pb-px">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex-shrink-0',
                'border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              )}
            >
              {tab.icon}
              {isAr ? tab.labelAr : tab.labelEn}
              {tab.badge && (
                <span className="bg-brand-100 text-brand-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab isAr={isAr} fmtLocale={fmtLocale} />}
        {activeTab === 'trial'    && <TrialBalanceTab isAr={isAr} fmtLocale={fmtLocale} />}
        {activeTab === 'pl'       && <IncomeStatementTab isAr={isAr} fmtLocale={fmtLocale} />}
        {activeTab === 'bs'       && <BalanceSheetTab isAr={isAr} fmtLocale={fmtLocale} />}
        {activeTab === 'profit'   && <ProfitabilityTab isAr={isAr} fmtLocale={fmtLocale} />}
        {activeTab === 'vat'      && <VATReturnTab isAr={isAr} fmtLocale={fmtLocale} period={period} onPeriodChange={setPeriod} />}
      </div>
    </div>
  );
}
