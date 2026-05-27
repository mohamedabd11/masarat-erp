import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, users } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const [[agency], [user], allUsers] = await Promise.all([
      db.select().from(agencies).where(eq(agencies.id, agencyId)),
      db.select().from(users).where(eq(users.id, uid)),
      db.select().from(users).where(eq(users.agencyId, agencyId)),
    ]);

    if (!agency) return NextResponse.json({ error: 'وكالة غير موجودة' }, { status: 404 });

    return NextResponse.json({ agency, user: user ?? null, users: allUsers });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; phone: string; addressAr: string;
      vatNumber: string; crNumber: string; isVatRegistered: boolean;
      defaultCurrency: string; logoUrl: string;
    }>;
    const now = new Date();
    await db.update(agencies).set({ ...body, updatedAt: now }).where(eq(agencies.id, agencyId));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
