import { NextResponse } from 'next/server';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { uid } = await verifyAuth(request);
    const [row] = await db.select().from(users).where(eq(users.id, uid));
    if (!row) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    return NextResponse.json({ user: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { uid } = await verifyAuth(request);
    const body = await request.json() as { nameAr?: string; nameEn?: string };
    const set: { nameAr?: string; nameEn?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (body.nameAr !== undefined) set.nameAr = body.nameAr.trim();
    if (body.nameEn !== undefined) set.nameEn = body.nameEn.trim();
    const [row] = await db.update(users).set(set).where(eq(users.id, uid)).returning();
    return NextResponse.json({ user: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
