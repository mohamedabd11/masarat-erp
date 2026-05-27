import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; type: string; accountNumber?: string;
      bankName?: string; iban?: string; openingBalanceHalalas?: number; currency?: string;
    };
    if (!body.nameAr || !body.type) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    const id = crypto.randomUUID();
    const opening = body.openingBalanceHalalas ?? 0;
    await db.insert(bankAccounts).values({
      id, agencyId, nameAr: body.nameAr, nameEn: body.nameEn ?? null,
      type: body.type, accountNumber: body.accountNumber ?? null,
      bankName: body.bankName ?? null, iban: body.iban ?? null,
      openingBalanceHalalas: opening, currentBalanceHalalas: opening,
      currency: body.currency ?? 'SAR',
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
