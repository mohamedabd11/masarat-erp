/**
 * GET /api/accounting/vat-status
 *
 * Returns the agency's rolling 12-month revenue and warns if approaching
 * the ZATCA VAT registration threshold (375,000 SAR mandatory, 187,500 voluntary).
 *
 * Uses invoice totals (subtotalHalalas) to estimate taxable turnover.
 * Agencies that are already VAT-registered receive "already registered" status.
 */
import { NextResponse } from 'next/server';
import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, agencies } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const MANDATORY_THRESHOLD_HALALAS  = 375_000 * 100; // 375,000 SAR
const VOLUNTARY_THRESHOLD_HALALAS  = 187_500 * 100; // 187,500 SAR

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [agency] = await db
      .select({ isVatRegistered: agencies.isVatRegistered })
      .from(agencies)
      .where(eq(agencies.id, agencyId));

    if (agency?.isVatRegistered) {
      return NextResponse.json({
        status:              'registered',
        isVatRegistered:     true,
        rolling12MonthSar:   null,
        mandatoryThreshold:  375_000,
        voluntaryThreshold:  187_500,
        message:             null,
      });
    }

    // Compute rolling 12-month taxable turnover from confirmed invoices
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const fromDate = twelveMonthsAgo.toISOString().slice(0, 10);

    const [result] = await db
      .select({ total: sql<number>`cast(coalesce(sum(${invoices.subtotalHalalas}), 0) as bigint)` })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        gte(sql`${invoices.issueDate}`, fromDate),
        sql`${invoices.status} NOT IN ('cancelled', 'draft')`,
        sql`${invoices.type} IN ('380', '388', 'simplified')`,
      ));

    const rolling12 = Number(result?.total ?? 0);

    let status: 'ok' | 'approaching' | 'mandatory';
    let messageAr: string;
    let messageEn: string;

    if (rolling12 >= MANDATORY_THRESHOLD_HALALAS) {
      status    = 'mandatory';
      messageAr = `يجب التسجيل في ضريبة القيمة المضافة — تجاوزت إيراداتك السنوية عتبة ${(MANDATORY_THRESHOLD_HALALAS / 100).toLocaleString('ar-SA')} ر.س الإلزامية`;
      messageEn = `VAT registration is MANDATORY — your rolling 12-month revenue exceeds the SAR 375,000 mandatory threshold`;
    } else if (rolling12 >= VOLUNTARY_THRESHOLD_HALALAS) {
      status    = 'approaching';
      messageAr = `اقتربت من عتبة التسجيل الطوعي (187,500 ر.س) — النظر في التسجيل الآن يفيد لاسترداد ضريبة المدخلات`;
      messageEn = `Approaching the voluntary VAT threshold (SAR 187,500) — consider registering now to reclaim input VAT`;
    } else {
      status    = 'ok';
      messageAr = null as unknown as string;
      messageEn = null as unknown as string;
    }

    return NextResponse.json({
      status,
      isVatRegistered:       false,
      rolling12MonthHalalas: rolling12,
      rolling12MonthSar:     rolling12 / 100,
      mandatoryThreshold:    375_000,
      voluntaryThreshold:    187_500,
      percentOfMandatory:    Math.round((rolling12 / MANDATORY_THRESHOLD_HALALAS) * 100),
      messageAr,
      messageEn,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
