import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringInvoices } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

function calcNextIssueDate(frequency: string, dayOfMonth: number, from: Date): string {
  const d = new Date(from);
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (frequency === 'monthly') {
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else if (frequency === 'quarterly') {
    d.setMonth(d.getMonth() + 3);
    d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else if (frequency === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().split('T')[0]!;
}

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url      = new URL(request.url);
    const activeOnly = url.searchParams.get('active') !== '0';

    const conditions = [eq(recurringInvoices.agencyId, agencyId)];
    if (activeOnly) conditions.push(eq(recurringInvoices.isActive, true));

    const rows = await db
      .select()
      .from(recurringInvoices)
      .where(and(...conditions))
      .orderBy(desc(recurringInvoices.createdAt));

    return NextResponse.json({ recurringInvoices: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as {
      title:          string;
      frequency:      string;
      startDate:      string;
      dayOfMonth?:    number;
      endDate?:       string;
      customerId?:    string;
      buyerNameAr?:   string;
      subtotalHalalas: number;
      vatHalalas?:    number;
      totalHalalas?:  number;
      items?:         unknown;
      notes?:         string;
      paymentMethod?: string;
    };

    if (!body.title?.trim())   return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 });
    if (!body.startDate)       return NextResponse.json({ error: 'تاريخ البداية مطلوب' }, { status: 400 });
    const VALID_FREQ = new Set(['weekly', 'monthly', 'quarterly', 'yearly']);
    if (!VALID_FREQ.has(body.frequency)) return NextResponse.json({ error: 'التكرار غير صالح' }, { status: 400 });

    const startDate   = new Date(body.startDate);
    const dayOfMonth  = body.dayOfMonth ?? startDate.getDate();
    const nextIssueAt = body.startDate; // first issue = start date itself

    const id = crypto.randomUUID();
    await db.insert(recurringInvoices).values({
      id,
      agencyId,
      title:           body.title.trim(),
      frequency:       body.frequency,
      startDate:       body.startDate,
      endDate:         body.endDate       ?? null,
      dayOfMonth,
      nextIssueAt,
      customerId:      body.customerId    ?? null,
      buyerNameAr:     body.buyerNameAr   ?? null,
      subtotalHalalas: body.subtotalHalalas,
      vatHalalas:      body.vatHalalas    ?? 0,
      totalHalalas:    body.totalHalalas  ?? body.subtotalHalalas,
      items:           (body.items        ?? null) as never,
      notes:           body.notes         ?? null,
      paymentMethod:   body.paymentMethod ?? null,
      createdBy:       uid,
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'recurring_invoice', resourceId: id, after: { title: body.title } });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
