/**
 * GET /api/travel/pnr/[code]
 *
 * Retrieves a PNR by its GDS code.
 *
 * Behaviour:
 *  - Without ?credentialId=xxx  → returns stored record from pnr_records (fast, no GDS call)
 *  - With    ?credentialId=xxx  → fetches live data from GDS, returns fresh PnrResult
 *
 * The [code] param is the GDS PNR code (e.g. Amadeus order ID).
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { resolveFlightProvider } from '@/lib/provider-factory';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { db } from '@/lib/db';
import { pnrRecords } from '@/lib/schema';

export async function GET(
  request: Request,
  { params }: { params: { code: string } },
) {
  let agencyId = '';
  let uid      = '';

  try {
    const auth = await verifyAuth(request);
    agencyId   = auth.agencyId;
    uid        = auth.uid;

    const pnrCode      = decodeURIComponent(params.code);
    const url          = new URL(request.url);
    const credentialId = url.searchParams.get('credentialId') ?? undefined;

    // Always load DB record first (used as fallback and for ownership check)
    const dbRows = await db
      .select()
      .from(pnrRecords)
      .where(and(
        eq(pnrRecords.pnrCode,  pnrCode),
        eq(pnrRecords.agencyId, agencyId),
      ))
      .limit(1);

    const dbRow = dbRows[0];

    // If no credentialId → return stored record only
    if (!credentialId) {
      if (!dbRow) {
        return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ pnr: dbRow, source: 'database' });
    }

    // credentialId provided → fetch live from GDS
    const { provider, credentials, providerCode } = await resolveFlightProvider(
      credentialId, agencyId,
    );

    void logTravelEvent({
      agencyId,
      eventType:    'retrieve_pnr_requested',
      provider:     providerCode,
      resourceId:   pnrCode,
      resourceType: 'pnr',
      actorId:      uid,
    });

    const start = Date.now();
    let pnrResult;

    try {
      pnrResult = await provider.retrievePNR(pnrCode, credentials);
    } catch (err) {
      const durationMs = Date.now() - start;
      void logTravelEvent({
        agencyId,
        eventType:    'retrieve_pnr_failed',
        provider:     providerCode,
        resourceId:   pnrCode,
        resourceType: 'pnr',
        actorId:      uid,
        payload:      { error: String(err), durationMs },
      });
      void logProviderSync({
        agencyId,
        provider:     providerCode,
        operation:    'retrieve_pnr',
        status:       'failed',
        referenceId:  pnrCode,
        errorMessage: String(err),
        durationMs,
      });
      throw err;
    }

    const durationMs = Date.now() - start;

    void logTravelEvent({
      agencyId,
      eventType:    'retrieve_pnr_succeeded',
      provider:     providerCode,
      resourceId:   pnrCode,
      resourceType: 'pnr',
      actorId:      uid,
      payload:      { durationMs },
    });
    void logProviderSync({
      agencyId,
      provider:    providerCode,
      operation:   'retrieve_pnr',
      status:      'success',
      referenceId: pnrCode,
      durationMs,
    });

    return NextResponse.json({ pnr: pnrResult, source: 'gds' });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'travel_retrieve_pnr_error', error: String(err), agencyId }));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
