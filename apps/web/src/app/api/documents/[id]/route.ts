import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string } };

export async function DELETE(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);

    const [doc] = await db.select()
      .from(documents)
      .where(and(eq(documents.id, params.id), eq(documents.agencyId, agencyId)));

    if (!doc) return NextResponse.json({ error: 'المستند غير موجود' }, { status: 404 });

    // Delete from Vercel Blob first (non-fatal if it fails — record still removed)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(doc.fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {
        // Blob deletion failure should not block DB cleanup
      }
    }

    await db.delete(documents).where(and(eq(documents.id, params.id), eq(documents.agencyId, agencyId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'document_delete_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
