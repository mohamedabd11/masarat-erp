import { NextResponse } from 'next/server';
import { eq, and, desc, or, ilike, isNull, sql, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url      = new URL(request.url);
    const search   = url.searchParams.get('q')          ?? undefined;
    const status   = url.searchParams.get('status')     ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const showDeleted = url.searchParams.get('deleted') === 'true';
    const page     = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '200', 10) || 200));
    const offset   = (page - 1) * pageSize;
    const conditions = [
      eq(pnrRecords.agencyId, agencyId),
      ...(showDeleted ? [] : [isNull(pnrRecords.deletedAt)]),
    ];
    if (status)     conditions.push(eq(pnrRecords.status, status));
    if (customerId) conditions.push(eq(pnrRecords.customerId, customerId));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(pnrRecords.pnrCode, pattern),
          // Cast to text because the column may be JSONB in older installations
          sql`${pnrRecords.passengerNames}::text ILIKE ${pattern}`,
          sql`${pnrRecords.ticketNumbers}::text ILIKE ${pattern}`,
        )!,
      );
    }

    const [{ total }] = await db.select({ total: count(pnrRecords.id) })
      .from(pnrRecords).where(and(...conditions));

    const rows = await db
      .select()
      .from(pnrRecords)
      .where(and(...conditions))
      .orderBy(desc(pnrRecords.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      pnrRecords: rows,
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
    assertRole(role, [...ROLES_AGENT_UP]);
    const body = await request.json() as {
      pnrCode:        string;
      gds?:           string;
      airline?:       string;
      flightNumbers?: string;
      origin?:        string;
      destination?:   string;
      departureDate?: string;
      returnDate?:    string;
      passengerCount?: number;
      passengerNames?: string;
      ticketNumbers?: string;
      fareHalalas?:   number;
      taxHalalas?:    number;
      totalHalalas?:  number;
      bookingId?:     string;
      customerId?:    string;
      expiresAt?:     string;
      notes?:         string;
    };

    if (!body.pnrCode?.trim()) {
      return NextResponse.json({ error: 'رمز PNR مطلوب' }, { status: 400 });
    }
    for (const f of ['fareHalalas', 'taxHalalas', 'totalHalalas'] as const) {
      const v = body[f];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
        return NextResponse.json({ error: 'مبلغ غير صالح' }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    await db.insert(pnrRecords).values({
      id,
      agencyId,
      pnrCode:        body.pnrCode.trim().toUpperCase(),
      gds:            body.gds            ?? null,
      airline:        body.airline        ?? null,
      flightNumbers:  body.flightNumbers  ?? null,
      origin:         body.origin         ?? null,
      destination:    body.destination    ?? null,
      departureDate:  body.departureDate  ?? null,
      returnDate:     body.returnDate     ?? null,
      passengerCount: body.passengerCount ?? 1,
      passengerNames: body.passengerNames ?? null,
      ticketNumbers:  body.ticketNumbers  ?? null,
      fareHalalas:    body.fareHalalas    ?? 0,
      taxHalalas:     body.taxHalalas     ?? 0,
      totalHalalas:   body.totalHalalas   ?? 0,
      bookingId:      body.bookingId      ?? null,
      customerId:     body.customerId     ?? null,
      expiresAt:      body.expiresAt ? new Date(body.expiresAt) : null,
      notes:          body.notes          ?? null,
      createdBy:      uid,
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'pnr', resourceId: id, after: { pnrCode: body.pnrCode } });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = (err as Error).message ?? '';
    if (msg.includes('pnr_agency_code_uq')) {
      return NextResponse.json({ error: 'رمز PNR هذا موجود مسبقاً في حسابك' }, { status: 409 });
    }
    console.error(JSON.stringify({ event: 'pnr_create_failed', error: msg }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
