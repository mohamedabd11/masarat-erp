/**
 * POST /api/travel/flights/search
 *
 * Searches for flight offers via the agency's configured GDS provider.
 * Every call is logged to travel_events (requested + succeeded/failed).
 * Rate-limited to 30 searches/minute per agency to protect GDS quota.
 *
 * Request body:
 *   { credentialId: string, params: FlightSearchParams }
 *
 * Response:
 *   { offers: FlightOffer[], provider: string, searchedAt: string }
 */
import { NextResponse } from 'next/server';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { resolveFlightProvider } from '@/lib/provider-factory';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import type { FlightSearchParams } from '@masarat/travel-providers';

export async function POST(request: Request) {
  let agencyId = '';
  let uid      = '';

  try {
    const auth = await verifyAuth(request);
    agencyId   = auth.agencyId;
    uid        = auth.uid;

    const body = await request.json() as {
      credentialId?: unknown;
      params?:       unknown;
    };

    if (typeof body.credentialId !== 'string' || !body.credentialId) {
      return NextResponse.json({ error: 'credentialId مطلوب' }, { status: 400 });
    }
    if (!body.params || typeof body.params !== 'object') {
      return NextResponse.json({ error: 'params مطلوب' }, { status: 400 });
    }

    const params = body.params as FlightSearchParams;
    if (!params.origin || !params.destination || !params.departureDate) {
      return NextResponse.json(
        { error: 'origin, destination, departureDate مطلوبة في params' },
        { status: 400 },
      );
    }
    if (!Array.isArray(params.passengers) || params.passengers.length === 0) {
      return NextResponse.json(
        { error: 'passengers مطلوب (مثال: [{"type":"ADT","count":1}])' },
        { status: 400 },
      );
    }

    // Rate limit by agency (30 GDS searches/minute)
    const rl = await checkRateLimit(`${agencyId}:travel_search`, 'gds_search');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت حد البحث المسموح (30 بحثاً في الدقيقة)، حاول بعد لحظات' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // Resolve provider (decrypts credential, validates config)
    const { provider, credentials, providerCode } = await resolveFlightProvider(
      body.credentialId, agencyId,
    );

    // Log: requested
    void logTravelEvent({
      agencyId,
      eventType:    'search_flights_requested',
      provider:     providerCode,
      actorId:      uid,
      payload:      {
        origin:        params.origin,
        destination:   params.destination,
        departureDate: params.departureDate,
        returnDate:    params.returnDate,
      },
    });

    const start = Date.now();

    let offers;
    try {
      offers = await provider.searchFlights(params, credentials);
    } catch (err) {
      const durationMs = Date.now() - start;
      void logTravelEvent({
        agencyId,
        eventType:    'search_flights_failed',
        provider:     providerCode,
        actorId:      uid,
        payload:      { error: String(err), durationMs },
      });
      void logProviderSync({
        agencyId,
        provider:     providerCode,
        operation:    'search_flights',
        status:       'failed',
        errorMessage: String(err),
        durationMs,
      });
      throw err;
    }

    const durationMs = Date.now() - start;

    void logTravelEvent({
      agencyId,
      eventType: 'search_flights_succeeded',
      provider:  providerCode,
      actorId:   uid,
      payload:   { offerCount: offers.length, durationMs },
    });
    void logProviderSync({
      agencyId,
      provider:  providerCode,
      operation: 'search_flights',
      status:    'success',
      durationMs,
    });

    return NextResponse.json({
      offers,
      provider:   providerCode,
      searchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'travel_search_error', error: String(err), agencyId }));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
