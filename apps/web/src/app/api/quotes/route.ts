import { NextResponse } from 'next/server';
import { eq, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, quotes } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { prepareQuote, presentQuote, QuotePayloadError, validateQuoteTax } from '@/lib/quote-presentation';

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
      quotes: rows.map(presentQuote),
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
    const prepared = prepareQuote(await request.json());
    const [agency] = await db.select({
      isVatRegistered: agencies.isVatRegistered,
      vatRate: agencies.vatRate,
    }).from(agencies).where(eq(agencies.id, agencyId));
    if (!agency) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });
    validateQuoteTax(prepared, {
      isVatRegistered: agency.isVatRegistered,
      vatRate: agency.vatRate ?? 15,
    });

    const id = crypto.randomUUID();
    await db.insert(quotes).values({
      id,
      agencyId,
      createdBy:    uid,
      ...prepared,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof QuotePayloadError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
