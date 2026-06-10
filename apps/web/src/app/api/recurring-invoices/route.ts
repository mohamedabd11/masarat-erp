import { NextResponse } from 'next/server';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringInvoices } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url      = new URL(request.url);
    const activeOnly = url.searchParams.get('active') !== '0';
    const page     = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset   = (page - 1) * pageSize;

    const conditions = [eq(recurringInvoices.agencyId, agencyId)];
    if (activeOnly) conditions.push(eq(recurringInvoices.isActive, true));

    const [{ total }] = await db.select({ total: count(recurringInvoices.id) })
      .from(recurringInvoices).where(and(...conditions));

    const rows = await db
      .select()
      .from(recurringInvoices)
      .where(and(...conditions))
      .orderBy(desc(recurringInvoices.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      recurringInvoices: rows,
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
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
