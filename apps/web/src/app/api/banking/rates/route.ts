import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRates } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as { fromCurrency: string; toCurrency?: string; rate: number; effectiveDate: string };
    if (!body.fromCurrency || !body.rate || !body.effectiveDate) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
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
