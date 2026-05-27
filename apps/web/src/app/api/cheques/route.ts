import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cheques } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db
      .select()
      .from(cheques)
      .where(eq(cheques.agencyId, agencyId))
      .orderBy(desc(cheques.createdAt));
    return NextResponse.json({ cheques: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      chequeNumber: string; bankName?: string; amountHalalas: number;
      type: string; status?: string; issueDate?: string; dueDate?: string;
      payerName?: string; payeeName?: string; notes?: string;
    };
    if (!body.chequeNumber) return NextResponse.json({ error: 'رقم الشيك مطلوب' }, { status: 400 });
    if (!body.amountHalalas) return NextResponse.json({ error: 'المبلغ مطلوب' }, { status: 400 });
    const id = crypto.randomUUID();
    await db.insert(cheques).values({
      id,
      agencyId,
      chequeNumber: body.chequeNumber,
      bankName: body.bankName ?? null,
      amountHalalas: body.amountHalalas,
      type: body.type ?? 'incoming',
      status: body.status ?? 'pending',
      issueDate: body.issueDate ?? null,
      dueDate: body.dueDate ?? null,
      payerName: body.payerName ?? null,
      payeeName: body.payeeName ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
