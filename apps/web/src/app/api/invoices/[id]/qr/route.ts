import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [inv] = await db
      .select({ zatcaHash: invoices.zatcaHash })
      .from(invoices)
      .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId)));
    if (!inv?.zatcaHash) {
      return NextResponse.json({ error: 'QR not available' }, { status: 404 });
    }
    const dataUrl = await QRCode.toDataURL(inv.zatcaHash, { width: 128, margin: 1, errorCorrectionLevel: 'M' });
    return NextResponse.json({ dataUrl }, {
      headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
