import { NextResponse } from 'next/server';
import { eq, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url    = new URL(request.url);
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1',  10) || 1);
    const limit  = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;

    const [{ total }] = await db
      .select({ total: count() })
      .from(suppliers)
      .where(eq(suppliers.agencyId, agencyId));

    const data = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.agencyId, agencyId))
      .orderBy(desc(suppliers.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      hasMore: offset + data.length < total,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; type?: string; phone?: string;
      email?: string; vatNumber?: string; notes?: string;
    };
    if (!body.nameAr) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    const id = crypto.randomUUID();
    await db.insert(suppliers).values({ id, agencyId, nameAr: body.nameAr, nameEn: body.nameEn ?? null, type: body.type ?? null, phone: body.phone ?? null, email: body.email ?? null, vatNumber: body.vatNumber ?? null, notes: body.notes ?? null });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
