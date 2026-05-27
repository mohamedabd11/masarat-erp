import { NextResponse } from 'next/server';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chartOfAccounts } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.agencyId, agencyId))
      .orderBy(asc(chartOfAccounts.code));
    return NextResponse.json({ accounts: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      code: string; nameAr: string; nameEn?: string; type: string;
    };
    if (!body.code || !body.nameAr || !body.type) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.insert(chartOfAccounts).values({
      id, agencyId, code: body.code.trim(), nameAr: body.nameAr, nameEn: body.nameEn ?? null,
      type: body.type, level: 1,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
