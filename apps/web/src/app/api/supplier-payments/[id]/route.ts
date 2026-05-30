import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [payment] = await db.select().from(supplierPayments)
      .where(and(eq(supplierPayments.id, params.id), eq(supplierPayments.agencyId, agencyId)));
    if (!payment) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
    return NextResponse.json({ payment });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
