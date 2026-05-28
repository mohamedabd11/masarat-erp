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
      vatRate: number; defaultCurrency: string; logoUrl: string;
      city: string; contactEmail: string; contactPhone: string; contactHours: string;
    }>;

    // Server-side VAT number format validation (15 digits starting with 300)
    if (body.isVatRegistered && body.vatNumber !== undefined) {
      const vat = body.vatNumber.trim();
      if (vat && !/^300\d{12}$/.test(vat)) {
        return NextResponse.json({ error: 'الرقم الضريبي يجب أن يكون 15 خانة ويبدأ بـ 300' }, { status: 400 });
      }
    }

    // Sanitize vatRate: only allow recognised Gulf VAT rates
    if (body.vatRate !== undefined) {
      const allowed = [0, 5, 10, 15, 20];
      if (!allowed.includes(body.vatRate)) {
        return NextResponse.json({ error: 'معدل الضريبة غير مدعوم' }, { status: 400 });
      }
    }

    const now = new Date();
    await db.update(agencies).set({ ...body, updatedAt: now }).where(eq(agencies.id, agencyId));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
