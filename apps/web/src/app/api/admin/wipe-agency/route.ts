import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/rate-limit';
import {
  agencies, users, bookings, invoices, payments, receiptVouchers,
  supplierPayments, journalEntries, journalLines, chartOfAccounts,
  agencyCounters, idempotencyKeys, customers, suppliers, employees,
  bankAccounts, bankTransactions, cheques, exchangeRates,
} from '@/lib/schema';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'];
if (!SUPER_ADMIN_EMAIL) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

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
    const rl = await checkRateLimit(getClientIp(request), 'register');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'طلبات كثيرة جداً، حاول لاحقاً' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

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

    // Delete in dependency order (journal_lines first since they ref journal_entries)
    // Most tables cascade from agencyId, but let's be explicit
    await db.delete(journalLines).where(eq(journalLines.agencyId, agencyId));
    await db.delete(journalEntries).where(eq(journalEntries.agencyId, agencyId));
    await db.delete(payments).where(eq(payments.agencyId, agencyId));
    await db.delete(receiptVouchers).where(eq(receiptVouchers.agencyId, agencyId));
    await db.delete(supplierPayments).where(eq(supplierPayments.agencyId, agencyId));
    await db.delete(invoices).where(eq(invoices.agencyId, agencyId));
    await db.delete(bookings).where(eq(bookings.agencyId, agencyId));
    await db.delete(customers).where(eq(customers.agencyId, agencyId));
    await db.delete(suppliers).where(eq(suppliers.agencyId, agencyId));
    await db.delete(employees).where(eq(employees.agencyId, agencyId));
    await db.delete(bankTransactions).where(eq(bankTransactions.agencyId, agencyId));
    await db.delete(cheques).where(eq(cheques.agencyId, agencyId));
    await db.delete(bankAccounts).where(eq(bankAccounts.agencyId, agencyId));
    await db.delete(exchangeRates).where(eq(exchangeRates.agencyId, agencyId));
    await db.delete(chartOfAccounts).where(eq(chartOfAccounts.agencyId, agencyId));
    await db.delete(agencyCounters).where(eq(agencyCounters.agencyId, agencyId));
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.agencyId, agencyId));

    // Re-seed default chart of accounts
    const DEFAULT_COA = [
      { code: '1100', nameAr: 'النقدية',                      nameEn: 'Cash',                         type: 'asset'     },
      { code: '1110', nameAr: 'البنك',                        nameEn: 'Bank',                         type: 'asset'     },
      { code: '1120', nameAr: 'ذمم مدينة - عملاء',           nameEn: 'Accounts Receivable',          type: 'asset'     },
      { code: '2000', nameAr: 'ذمم دائنة - موردون',          nameEn: 'Accounts Payable - Suppliers', type: 'liability' },
      { code: '2200', nameAr: 'ضريبة القيمة المضافة مستحقة', nameEn: 'VAT Payable',                  type: 'liability' },
      { code: '2300', nameAr: 'ودائع العملاء',                nameEn: 'Customer Deposits',            type: 'liability' },
      { code: '4000', nameAr: 'إيراد رسوم الوكالة',          nameEn: 'Revenue - Agency Fees',        type: 'revenue'   },
      { code: '4100', nameAr: 'إيراد خدمات السفر',           nameEn: 'Revenue - Travel Services',    type: 'revenue'   },
      { code: '5000', nameAr: 'تكلفة الخدمات',               nameEn: 'Cost of Services',             type: 'expense'   },
    ];

    for (const ac of DEFAULT_COA) {
      await db.insert(chartOfAccounts).values({
        id: crypto.randomUUID(), agencyId,
        code: ac.code, nameAr: ac.nameAr, nameEn: ac.nameEn,
        type: ac.type, isSystem: true, level: 1,
      });
    }

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
