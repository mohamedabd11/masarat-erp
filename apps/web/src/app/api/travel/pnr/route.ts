/**
 * POST /api/travel/pnr
 *
 * Creates a PNR via the agency's GDS provider and saves it to pnr_records.
 * Requires that the offer came from /api/travel/flights/search (offer._raw present).
 *
 * Request body:
 *   {
 *     credentialId: string,
 *     offer:        FlightOffer,   // includes _raw from search
 *     passengers:   PassengerInfo[],
 *     contactEmail: string,
 *     contactPhone?: string,
 *     bookingId?:   string,        // link to existing booking (optional)
 *     customerId?:  string,        // link to customer (optional)
 *   }
 *
 * Response:
 *   { pnr: PnrResult, pnrDbId: string }
 */
import { NextResponse } from 'next/server';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { resolveFlightProvider } from '@/lib/provider-factory';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';
import type { FlightOffer, PassengerInfo } from '@masarat/travel-providers';

export async function POST(request: Request) {
  let agencyId = '';
  let uid      = '';

  try {
    const auth = await verifyAuth(request);
    agencyId   = auth.agencyId;
    uid        = auth.uid;

    const body = await request.json() as {
      credentialId?: unknown;
      offer?:        unknown;
      passengers?:   unknown;
      contactEmail?: unknown;
      contactPhone?: unknown;
      bookingId?:    string;
      customerId?:   string;
    };

    if (typeof body.credentialId !== 'string' || !body.credentialId) {
      return NextResponse.json({ error: 'credentialId مطلوب' }, { status: 400 });
    }
    if (!body.offer || typeof body.offer !== 'object') {
      return NextResponse.json({ error: 'offer مطلوب' }, { status: 400 });
    }
    if (!Array.isArray(body.passengers) || body.passengers.length === 0) {
      return NextResponse.json({ error: 'passengers مطلوب (مصفوفة بيانات الركاب)' }, { status: 400 });
    }
    if (typeof body.contactEmail !== 'string' || !body.contactEmail) {
      return NextResponse.json({ error: 'contactEmail مطلوب' }, { status: 400 });
    }

    const offer      = body.offer      as FlightOffer;
    const passengers = body.passengers as PassengerInfo[];

    // Rate limit: PNR creation shares the gds_search budget (same 30/min)
    const rl = await checkRateLimit(`${agencyId}:travel_pnr`, 'gds_search');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'طلبات كثيرة جداً، حاول بعد لحظات' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const { provider, credentials, providerCode } = await resolveFlightProvider(
      body.credentialId, agencyId,
    );

    void logTravelEvent({
      agencyId,
      eventType:    'create_pnr_requested',
      provider:     providerCode,
      actorId:      uid,
      payload:      {
        origin:          offer.origin,
        destination:     offer.destination,
        departureAt:     offer.departureAt,
        passengerCount:  passengers.length,
      },
    });

    const start = Date.now();
    let pnrResult;

    try {
      pnrResult = await provider.createPNR(
        { offer, passengers, contactEmail: body.contactEmail, contactPhone: body.contactPhone as string | undefined },
        credentials,
      );
    } catch (err) {
      const durationMs = Date.now() - start;
      void logTravelEvent({
        agencyId,
        eventType:    'create_pnr_failed',
        provider:     providerCode,
        actorId:      uid,
        payload:      { error: String(err), durationMs },
      });
      void logProviderSync({
        agencyId,
        provider:     providerCode,
        operation:    'create_pnr',
        status:       'failed',
        errorMessage: String(err),
        durationMs,
      });
      throw err;
    }

    const durationMs = Date.now() - start;

    // Persist PNR to local database
    const pnrDbId    = crypto.randomUUID();
    const firstSeg   = pnrResult.segments[0];

    await db.insert(pnrRecords).values({
      id:             pnrDbId,
      agencyId,
      pnrCode:        pnrResult.pnrCode,
      gds:            pnrResult.gds,
      airline:        firstSeg?.airline            ?? offer.airline,
      flightNumbers:  JSON.stringify(
        pnrResult.segments.map(s => s.flightNumber),
      ),
      origin:         firstSeg?.origin             ?? offer.origin,
      destination:    firstSeg?.destination        ?? offer.destination,
      departureDate:  firstSeg?.departureDate       ?? offer.departureAt.slice(0, 10),
      passengerCount: passengers.length,
      passengerNames: JSON.stringify(
        pnrResult.passengers.map(p => `${p.firstName} ${p.lastName}`),
      ),
      fareHalalas:    offer.fareHalalas,
      taxHalalas:     offer.taxHalalas,
      totalHalalas:   pnrResult.totalHalalas,
      bookingId:      body.bookingId  ?? null,
      customerId:     body.customerId ?? null,
      status:         'active',
      expiresAt:      pnrResult.expiresAt ?? null,
      createdBy:      uid,
    });

    void logTravelEvent({
      agencyId,
      eventType:    'create_pnr_succeeded',
      provider:     providerCode,
      resourceId:   pnrResult.pnrCode,
      resourceType: 'pnr',
      actorId:      uid,
      payload:      { pnrDbId, durationMs },
    });
    void logProviderSync({
      agencyId,
      provider:    providerCode,
      operation:   'create_pnr',
      status:      'success',
      referenceId: pnrResult.pnrCode,
      durationMs,
    });

    return NextResponse.json({ pnr: pnrResult, pnrDbId }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Unique constraint violation: same PNR code already exists for this agency
    if (String(err).includes('pnr_agency_code_uq') || String(err).includes('unique')) {
      return NextResponse.json(
        { error: 'هذا الـ PNR موجود بالفعل في النظام' },
        { status: 409 },
      );
    }
    console.error(JSON.stringify({ event: 'travel_create_pnr_error', error: String(err), agencyId }));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
