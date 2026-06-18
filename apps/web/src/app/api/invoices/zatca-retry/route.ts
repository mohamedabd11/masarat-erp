import { NextResponse } from 'next/server';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { submitInvoiceToZatca } from '@/lib/zatca-einvoice';

export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, ROLES_ADMIN_ONLY as unknown as string[]);

    const { invoiceId } = await request.json() as { invoiceId?: string };
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId مطلوب' }, { status: 400 });
    }

    const result = await submitInvoiceToZatca(agencyId, invoiceId);
    return NextResponse.json({ success: result.submitted, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'zatca_retry_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
