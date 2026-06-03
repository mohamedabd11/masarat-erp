import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRates } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';

// GET /api/banking/rates?currency=USD&toCurrency=SAR
// Returns all stored rates (latest first), optionally filtered by fromCurrency.
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url      = new URL(request.url);
    const currency = url.searchParams.get('currency')?.toUpperCase();
    const to       = url.searchParams.get('toCurrency')?.toUpperCase() ?? 'SAR';

    const conditions = [eq(exchangeRates.agencyId, agencyId), eq(exchangeRates.toCurrency, to)];
    if (currency) conditions.push(eq(exchangeRates.fromCurrency, currency));

    const rows = await db.select().from(exchangeRates)
      .where(and(...conditions))
      .orderBy(desc(exchangeRates.effectiveDate));

    // Express the stored rate (× 10000) back as a decimal for the caller
    const rates = rows.map((r: typeof rows[number]) => ({
      id:            r.id,
      fromCurrency:  r.fromCurrency,
      toCurrency:    r.toCurrency,
      rate:          r.rate / 10000,        // e.g. 3.75
      storedRate:    r.rate,                // raw value for debugging
      effectiveDate: r.effectiveDate,
    }));

    return NextResponse.json({ rates });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const body = await request.json() as { fromCurrency: string; toCurrency?: string; rate: number; effectiveDate: string };
    if (!body.fromCurrency || !body.rate || !body.effectiveDate) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    if (!Number.isFinite(body.rate) || body.rate <= 0) {
      return NextResponse.json({ error: 'سعر الصرف غير صالح' }, { status: 400 });
    }
    if (Number.isNaN(Date.parse(body.effectiveDate))) {
      return NextResponse.json({ error: 'تاريخ غير صالح' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.insert(exchangeRates).values({
      id, agencyId, fromCurrency: body.fromCurrency, toCurrency: body.toCurrency ?? 'SAR',
      rate: Math.round(body.rate * 10000), effectiveDate: body.effectiveDate,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
