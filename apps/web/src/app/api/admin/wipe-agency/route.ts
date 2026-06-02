import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import {
  agencies, users, bookings, invoices, payments, receiptVouchers,
  supplierPayments, journalEntries, journalLines, chartOfAccounts,
  agencyCounters, idempotencyKeys, customers, suppliers, employees,
  bankAccounts, bankTransactions, cheques, exchangeRates,
} from '@/lib/schema';

// Full default chart of accounts — kept identical to the DEFAULT_COA seeded on
// registration in src/app/api/auth/register/route.ts. Re-seeded after a wipe so
// a reset agency starts with the same complete COA as a freshly registered one.
const DEFAULT_COA = [
  { code: '1100', nameAr: 'النقدية',                      nameEn: 'Cash',                         type: 'asset',     },
  { code: '1110', nameAr: 'البنك',                        nameEn: 'Bank',                         type: 'asset',     },
  { code: '1115', nameAr: 'نقاط البيع / بطاقات الائتمان', nameEn: 'POS / Credit Cards',           type: 'asset',     },
  { code: '1120', nameAr: 'ذمم مدينة - عملاء',           nameEn: 'Accounts Receivable',          type: 'asset',     },
  { code: '1125', nameAr: 'أوراق قبض - شيكات',                    nameEn: 'Cheques Receivable',                    type: 'asset',     },
  { code: '1130', nameAr: 'المصاريف المدفوعة مقدماً',             nameEn: 'Prepaid Expenses',                      type: 'asset',     },
  { code: '1230', nameAr: 'ضريبة المدخلات القابلة للاسترداد',     nameEn: 'Input VAT Receivable',                  type: 'asset',     },
  { code: '1350', nameAr: 'مقاصة BSP',                             nameEn: 'BSP Clearing',                          type: 'asset',     },
  { code: '2000', nameAr: 'ذمم دائنة - موردون',          nameEn: 'Accounts Payable - Suppliers', type: 'liability', },
  { code: '2100', nameAr: 'ذمم دائنة — شركات الطيران',   nameEn: 'Accounts Payable - Airlines',  type: 'liability', },
  { code: '2110', nameAr: 'ذمم دائنة — فنادق',           nameEn: 'Accounts Payable - Hotels',    type: 'liability', },
  { code: '2150', nameAr: 'مستحقات BSP',                  nameEn: 'BSP Payable',                  type: 'liability', },
  { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة', nameEn: 'VAT Payable',                  type: 'liability', },
  { code: '2300', nameAr: 'ودائع العملاء',                nameEn: 'Customer Deposits',            type: 'liability', },
  { code: '2310', nameAr: 'رواتب مستحقة للدفع',           nameEn: 'Salaries Payable',             type: 'liability', },
  { code: '2400', nameAr: 'GOSI مستحقة',                   nameEn: 'GOSI Payable',                 type: 'liability', },
  { code: '2500', nameAr: 'مخصص مكافأة نهاية الخدمة',     nameEn: 'EOSB Provision',               type: 'liability', },
  { code: '3100', nameAr: 'رأس مال المالك',               nameEn: 'Owner Capital',                type: 'equity',    },
  { code: '3200', nameAr: 'الأرباح المحتجزة',             nameEn: 'Retained Earnings',            type: 'equity',    },
  { code: '3201', nameAr: 'إيراد مؤجل - خدمات سفر',       nameEn: 'Deferred Revenue - Travel',    type: 'liability', },
  { code: '4000', nameAr: 'إيراد رسوم الوكالة',          nameEn: 'Revenue - Agency Fees',        type: 'revenue',   },
  { code: '4100', nameAr: 'إيراد خدمات السفر',           nameEn: 'Revenue - Travel Services',    type: 'revenue',   },
  { code: '4110', nameAr: 'إيرادات الباقات السياحية',    nameEn: 'Tour Package Revenue',         type: 'revenue',   },
  { code: '4120', nameAr: 'إيرادات الفنادق',             nameEn: 'Hotel Revenue',                type: 'revenue',   },
  { code: '4130', nameAr: 'إيرادات العمرة',              nameEn: 'Umrah Revenue',                type: 'revenue',   },
  { code: '4140', nameAr: 'إيرادات التأشيرات',           nameEn: 'Visa Revenue',                 type: 'revenue',   },
  { code: '4150', nameAr: 'إيرادات التأمين',             nameEn: 'Insurance Revenue',            type: 'revenue',   },
  { code: '4420', nameAr: 'إيراد استرداد ADM',           nameEn: 'ADM Recovery Income',          type: 'revenue',   },
  { code: '4510', nameAr: 'إيراد فروق المطابقة البنكية',  nameEn: 'Bank Reconciliation Income',   type: 'revenue',   },
  { code: '4900', nameAr: 'أرباح فروق أسعار الصرف',       nameEn: 'FX Exchange Gain',             type: 'revenue',   },
  { code: '5000', nameAr: 'تكلفة الخدمات',               nameEn: 'Cost of Services',             type: 'expense',   },
  { code: '5100', nameAr: 'الرواتب والأجور',             nameEn: 'Salaries',                     type: 'expense',   },
  { code: '5200', nameAr: 'الإيجار',                     nameEn: 'Rent',                         type: 'expense',   },
  { code: '5300', nameAr: 'التسويق والإعلان',            nameEn: 'Marketing',                    type: 'expense',   },
  { code: '5400', nameAr: 'المصاريف التشغيلية',          nameEn: 'Operating Expenses',           type: 'expense',   },
  { code: '5420', nameAr: 'مصروف ADM',                   nameEn: 'ADM Expense',                  type: 'expense',   },
  { code: '5510', nameAr: 'مصروف فروق المطابقة البنكية',  nameEn: 'Bank Reconciliation Expense',  type: 'expense',   },
  { code: '5900', nameAr: 'خسائر فروق أسعار الصرف',       nameEn: 'FX Exchange Loss',             type: 'expense',   },
  { code: '6100', nameAr: 'مصروف الرواتب',               nameEn: 'Salary Expense',               type: 'expense',   },
  { code: '6200', nameAr: 'مصروف GOSI - صاحب العمل',     nameEn: 'GOSI Expense - Employer',      type: 'expense',   },
  { code: '6300', nameAr: 'مصروف مكافأة نهاية الخدمة',   nameEn: 'EOSB Expense',                 type: 'expense',   },
  // Suspense/clearing — holds unclassified deposits until reclassified by accountant.
  { code: '9001', nameAr: 'حساب تعليق - إيرادات غير مصنفة', nameEn: 'Suspense - Unclassified Receipts', type: 'liability' },
] as const;

async function verifySuperAdmin(request: Request) {
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (!superAdminEmail) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== superAdminEmail) throw new Error('FORBIDDEN');
  return decoded;
}

export async function POST(request: Request) {
  try {
    const { ensureAdminApp } = await import('@/lib/firebase-admin');
    ensureAdminApp();
    await verifySuperAdmin(request);

    const body = await request.json() as { agencyId: string; confirmName: string };
    const { agencyId, confirmName } = body;

    if (!agencyId || !confirmName) {
      return NextResponse.json({ error: 'agencyId و confirmName مطلوبان' }, { status: 400 });
    }

    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) {
      return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });
    }
    if (agency.nameAr !== confirmName) {
      return NextResponse.json({ error: 'اسم الوكالة غير مطابق' }, { status: 422 });
    }
    if (agency.subscriptionStatus !== 'trial') {
      return NextResponse.json(
        { error: 'التصفير متاح فقط للوكالات في الفترة التجريبية' },
        { status: 403 }
      );
    }

    // Wipe + re-seed atomically: a mid-sequence failure must NOT leave the
    // agency half-wiped. Everything below runs inside a single transaction that
    // rolls back entirely on any error.
    await db.transaction(async (tx) => {
      // Delete in dependency order (journal_lines first since they ref journal_entries)
      // Most tables cascade from agencyId, but let's be explicit
      await tx.delete(journalLines).where(eq(journalLines.agencyId, agencyId));
      await tx.delete(journalEntries).where(eq(journalEntries.agencyId, agencyId));
      await tx.delete(payments).where(eq(payments.agencyId, agencyId));
      await tx.delete(receiptVouchers).where(eq(receiptVouchers.agencyId, agencyId));
      await tx.delete(supplierPayments).where(eq(supplierPayments.agencyId, agencyId));
      await tx.delete(invoices).where(eq(invoices.agencyId, agencyId));
      await tx.delete(bookings).where(eq(bookings.agencyId, agencyId));
      await tx.delete(customers).where(eq(customers.agencyId, agencyId));
      await tx.delete(suppliers).where(eq(suppliers.agencyId, agencyId));
      await tx.delete(employees).where(eq(employees.agencyId, agencyId));
      await tx.delete(bankTransactions).where(eq(bankTransactions.agencyId, agencyId));
      await tx.delete(cheques).where(eq(cheques.agencyId, agencyId));
      await tx.delete(bankAccounts).where(eq(bankAccounts.agencyId, agencyId));
      await tx.delete(exchangeRates).where(eq(exchangeRates.agencyId, agencyId));
      await tx.delete(chartOfAccounts).where(eq(chartOfAccounts.agencyId, agencyId));
      await tx.delete(agencyCounters).where(eq(agencyCounters.agencyId, agencyId));
      await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.agencyId, agencyId));

      // Re-seed the full default chart of accounts — must stay identical to the
      // DEFAULT_COA seeded on registration in src/app/api/auth/register/route.ts.
      for (const ac of DEFAULT_COA) {
        await tx.insert(chartOfAccounts).values({
          id: crypto.randomUUID(), agencyId,
          code: ac.code, nameAr: ac.nameAr, nameEn: ac.nameEn,
          type: ac.type, isSystem: true, level: 1,
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `تم تصفير بيانات وكالة "${agency.nameAr}" بنجاح`,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error(JSON.stringify({ event: 'admin_wipe_agency_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
