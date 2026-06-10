import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(req: Request) {
  try {
    const { agencyId } = await verifyAuth(req);
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType');
    const entityId   = searchParams.get('entityId');

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType و entityId مطلوبان' }, { status: 400 });
    }

    const docs = await db.select()
      .from(documents)
      .where(and(
        eq(documents.agencyId, agencyId),
        eq(documents.entityType, entityType),
        eq(documents.entityId, entityId),
      ))
      .orderBy(asc(documents.createdAt));

    return NextResponse.json({ documents: docs });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
