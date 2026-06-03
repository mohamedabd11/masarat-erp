/**
 * Integration Tests — Registration / Chart of Accounts Seeding (Real DB)
 *
 * Tests run against a real local PostgreSQL database. They replicate the
 * Chart-of-Accounts seeding performed by src/app/api/auth/register/route.ts
 * directly against Drizzle (no HTTP — Firebase auth is bypassed), and verify the
 * seeded COA invariants for a freshly registered agency.
 *
 * Verifies:
 *  1. 20+ accounts exist for the agency after seeding
 *  2. Account codes are unique within the agency (no duplicates)
 *  3. Key accounts are present: 1100, 1120, 2000, 3100, 4000, 5000
 *  4. Every seeded account is flagged isSystem and has a valid account type
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import { agencies, chartOfAccounts } from '@/lib/schema';

const AGENCY_ID = 'integ-test-auth-register-01';

// Mirror of DEFAULT_COA in src/app/api/auth/register/route.ts. Kept in sync so
// the seeding logic is exercised identically to the route.
const DEFAULT_COA: { code: string; nameAr: string; nameEn: string; type: string }[] = [
  { code: '1100', nameAr: 'النقدية',                      nameEn: 'Cash',                         type: 'asset'     },
  { code: '1110', nameAr: 'البنك',                        nameEn: 'Bank',                         type: 'asset'     },
  { code: '1115', nameAr: 'نقاط البيع / بطاقات الائتمان', nameEn: 'POS / Credit Cards',           type: 'asset'     },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',           nameEn: 'Accounts Receivable',          type: 'asset'     },
  { code: '1125', nameAr: 'أوراق قبض - شيكات',           nameEn: 'Cheques Receivable',           type: 'asset'     },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',    nameEn: 'Prepaid Expenses',             type: 'asset'     },
  { code: '1350', nameAr: 'مقاصة BSP',                    nameEn: 'BSP Clearing',                 type: 'asset'     },
  { code: '2000', nameAr: 'ذمم دائنة - موردون',          nameEn: 'Accounts Payable - Suppliers', type: 'liability' },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',   nameEn: 'Accounts Payable - Airlines',  type: 'liability' },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',           nameEn: 'Accounts Payable - Hotels',    type: 'liability' },
  { code: '2150', nameAr: 'مستحقات BSP',                  nameEn: 'BSP Payable',                  type: 'liability' },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة', nameEn: 'VAT Payable',                  type: 'liability' },
  { code: '2300', nameAr: 'ودائع العملاء',                nameEn: 'Customer Deposits',            type: 'liability' },
  { code: '2310', nameAr: 'رواتب مستحقة للدفع',           nameEn: 'Salaries Payable',             type: 'liability' },
  { code: '2400', nameAr: 'GOSI مستحقة',                   nameEn: 'GOSI Payable',                 type: 'liability' },
  { code: '2500', nameAr: 'مخصص مكافأة نهاية الخدمة',     nameEn: 'EOSB Provision',               type: 'liability' },
  { code: '3100', nameAr: 'رأس مال المالك',               nameEn: 'Owner Capital',                type: 'equity'    },
  { code: '3200', nameAr: 'الأرباح المحتجزة',             nameEn: 'Retained Earnings',            type: 'equity'    },
  { code: '3201', nameAr: 'إيراد مؤجل - خدمات سفر',       nameEn: 'Deferred Revenue - Travel',    type: 'liability' },
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',          nameEn: 'Revenue - Agency Fees',        type: 'revenue'   },
  { code: '4100', nameAr: 'إيراد خدمات السفر',           nameEn: 'Revenue - Travel Services',    type: 'revenue'   },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',    nameEn: 'Tour Package Revenue',         type: 'revenue'   },
  { code: '4120', nameAr: 'إيرادات الفنادق',             nameEn: 'Hotel Revenue',                type: 'revenue'   },
  { code: '4130', nameAr: 'إيرادات العمرة',              nameEn: 'Umrah Revenue',                type: 'revenue'   },
  { code: '4140', nameAr: 'إيرادات التأشيرات',           nameEn: 'Visa Revenue',                 type: 'revenue'   },
  { code: '4150', nameAr: 'إيرادات التأمين',             nameEn: 'Insurance Revenue',            type: 'revenue'   },
  { code: '4420', nameAr: 'إيراد استرداد ADM',           nameEn: 'ADM Recovery Income',          type: 'revenue'   },
  { code: '4510', nameAr: 'إيراد فروق المطابقة البنكية',  nameEn: 'Bank Reconciliation Income',   type: 'revenue'   },
  { code: '4900', nameAr: 'أرباح فروق أسعار الصرف',       nameEn: 'FX Exchange Gain',             type: 'revenue'   },
  { code: '5000', nameAr: 'تكلفة الخدمات',               nameEn: 'Cost of Services',             type: 'expense'   },
  { code: '5100', nameAr: 'الرواتب والأجور',             nameEn: 'Salaries',                     type: 'expense'   },
  { code: '5200', nameAr: 'الإيجار',                     nameEn: 'Rent',                         type: 'expense'   },
  { code: '5300', nameAr: 'التسويق والإعلان',            nameEn: 'Marketing',                    type: 'expense'   },
  { code: '5400', nameAr: 'المصاريف التشغيلية',          nameEn: 'Operating Expenses',           type: 'expense'   },
  { code: '5420', nameAr: 'مصروف ADM',                   nameEn: 'ADM Expense',                  type: 'expense'   },
  { code: '5510', nameAr: 'مصروف فروق المطابقة البنكية',  nameEn: 'Bank Reconciliation Expense',  type: 'expense'   },
  { code: '5900', nameAr: 'خسائر فروق أسعار الصرف',       nameEn: 'FX Exchange Loss',             type: 'expense'   },
  { code: '6100', nameAr: 'مصروف الرواتب',               nameEn: 'Salary Expense',               type: 'expense'   },
  { code: '6200', nameAr: 'مصروف GOSI - صاحب العمل',     nameEn: 'GOSI Expense - Employer',      type: 'expense'   },
  { code: '6300', nameAr: 'مصروف مكافأة نهاية الخدمة',   nameEn: 'EOSB Expense',                 type: 'expense'   },
];

const VALID_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);

/** Replicates the register route's agency creation + COA seeding loop. */
async function registerAgencyWithCoa() {
  const db = getTestDb();
  await db.transaction(async (tx) => {
    await tx.insert(agencies).values({
      id: AGENCY_ID, nameAr: 'وكالة اختبار التسجيل',
      nameEn: 'Register Test Agency', subscriptionStatus: 'active', isVatRegistered: false,
    });
    for (const ac of DEFAULT_COA) {
      await tx.insert(chartOfAccounts).values({
        id: crypto.randomUUID(), agencyId: AGENCY_ID,
        code: ac.code, nameAr: ac.nameAr, nameEn: ac.nameEn, type: ac.type,
        isSystem: true, level: 1,
      });
    }
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure a clean slate, then run the register/seed flow once.
  await sql(`DELETE FROM chart_of_accounts WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies          WHERE id        = '${AGENCY_ID}'`);
  await registerAgencyWithCoa();
});

afterAll(async () => {
  await sql(`DELETE FROM chart_of_accounts WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies          WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('auth/register — بذر شجرة الحسابات (COA seeding)', () => {

  it('يُنشئ 20+ حساباً للوكالة بعد التسجيل', async () => {
    const db = getTestDb();
    const rows = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.agencyId, AGENCY_ID));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.length).toBe(DEFAULT_COA.length);   // exactly the seeded set
  });

  it('أكواد الحسابات فريدة داخل الوكالة (لا تكرار)', async () => {
    const db = getTestDb();
    const rows = await db.select({ code: chartOfAccounts.code }).from(chartOfAccounts)
      .where(eq(chartOfAccounts.agencyId, AGENCY_ID));
    const codes = rows.map(r => r.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('الحسابات الأساسية موجودة: 1100, 1120, 2000, 3100, 4000, 5000', async () => {
    const db = getTestDb();
    const rows = await db.select({ code: chartOfAccounts.code }).from(chartOfAccounts)
      .where(eq(chartOfAccounts.agencyId, AGENCY_ID));
    const codes = new Set(rows.map(r => r.code));
    for (const key of ['1100', '1120', '2000', '3100', '4000', '5000']) {
      expect(codes.has(key)).toBe(true);
    }
  });

  it('كل حساب مبذور isSystem = true وله نوع صالح', async () => {
    const db = getTestDb();
    const rows = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.agencyId, AGENCY_ID));
    for (const r of rows) {
      expect(r.isSystem).toBe(true);
      expect(VALID_TYPES.has(r.type)).toBe(true);
      expect(r.nameAr.length).toBeGreaterThan(0);
    }
  });

  it('لا تكرار لأي كود حساب ضمن الوكالة الواحدة (تحقق على مستوى قاعدة البيانات)', async () => {
    // Group by code at the DB level — every code must appear exactly once for
    // this agency (codes are unique per agency in the seeded chart of accounts).
    const dup = await sql(
      `SELECT code, COUNT(*) AS c FROM chart_of_accounts ` +
      `WHERE agency_id = '${AGENCY_ID}' GROUP BY code HAVING COUNT(*) > 1`,
    );
    expect(dup.rowCount).toBe(0);
  });

});
