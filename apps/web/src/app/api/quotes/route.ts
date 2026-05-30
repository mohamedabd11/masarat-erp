import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db.select().from(quotes).where(eq(quotes.agencyId, agencyId)).orderBy(desc(quotes.createdAt));
    return NextResponse.json({ quotes: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      quoteNumber:   string;
      customerId?:   string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      items?:        unknown;
      totalHalalas?: number;
      status?:       string;
      validUntil?:   string | null;
      notes?:        string | null;
    };

    if (!body.quoteNumber) {
      return NextResponse.json({ error: 'quoteNumber مطلوب' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(quotes).values({
      id,
      agencyId,
      createdBy:    uid,
      quoteNumber:  body.quoteNumber,
      customerId:   body.customerId   ?? null,
      customerName: body.customerName ?? null,
      customerPhone: body.customerPhone ?? null,
      items:        body.items        ?? null,
      totalHalalas: body.totalHalalas ?? 0,
      status:       body.status       ?? 'draft',
      validUntil:   body.validUntil   ?? null,
      notes:        body.notes        ?? null,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
