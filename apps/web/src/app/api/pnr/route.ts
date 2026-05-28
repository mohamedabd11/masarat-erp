import { NextResponse } from 'next/server';
import { eq, and, desc, or, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url      = new URL(request.url);
    const search   = url.searchParams.get('q')          ?? undefined;
    const status   = url.searchParams.get('status')     ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const conditions = [eq(pnrRecords.agencyId, agencyId)];
    if (status)     conditions.push(eq(pnrRecords.status, status));
    if (customerId) conditions.push(eq(pnrRecords.customerId, customerId));
    if (search) {
      conditions.push(
        or(
          ilike(pnrRecords.pnrCode, `%${search}%`),
          ilike(pnrRecords.passengerNames, `%${search}%`),
          ilike(pnrRecords.ticketNumbers, `%${search}%`),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(pnrRecords)
      .where(and(...conditions))
      .orderBy(desc(pnrRecords.createdAt))
      .limit(200);

    return NextResponse.json({ pnrRecords: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
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
      expiresAt:      body.expiresAt      ?? null,
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
