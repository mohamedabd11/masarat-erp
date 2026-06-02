import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

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
    const { uid, agencyId, role } = await verifyAuth(request);
    // Agents and accountants routinely create quotes, so allow them in addition to managers and up.
    assertRole(role, [...ROLES_MANAGER_UP, 'agent', 'accountant']);
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

    // Enforce uniqueness of quoteNumber per agency (matches the quotes_agency_number_uq index).
    const existing = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.agencyId, agencyId), eq(quotes.quoteNumber, body.quoteNumber)))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'رقم عرض السعر مستخدم بالفعل' }, { status: 409 });
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
