import { NextResponse } from 'next/server';
import { eq, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url      = new URL(request.url);
    const page     = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset   = (page - 1) * pageSize;

    const [{ total }] = await db.select({ total: count(quotes.id) })
      .from(quotes).where(eq(quotes.agencyId, agencyId));

    const rows = await db.select().from(quotes)
      .where(eq(quotes.agencyId, agencyId))
      .orderBy(desc(quotes.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      quotes: rows,
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);
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
    if (body.totalHalalas !== undefined &&
        (!Number.isInteger(body.totalHalalas) || body.totalHalalas < 0)) {
      return NextResponse.json({ error: 'الإجمالي غير صالح' }, { status: 400 });
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
