import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pnrRecords, providerCredentials } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { resolveFlightProvider } from '@/lib/provider-factory';
import { logTravelEvent } from '@/lib/travel-event-log';
import { logProviderSync } from '@/lib/provider-sync-log';
import { logAudit } from '@/lib/audit';
import type { ProviderCode } from '@masarat/travel-providers';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const [pnr] = await db.select().from(pnrRecords)
      .where(and(
        eq(pnrRecords.id, params.id),
        eq(pnrRecords.agencyId, agencyId),
        isNull(pnrRecords.deletedAt),
      ));
    if (!pnr) return NextResponse.json({ error: 'PNR غير موجود' }, { status: 404 });
    if (!pnr.gds) return NextResponse.json({ error: 'لا يوجد مزود GDS لهذا PNR' }, { status: 400 });

    // Find the first active credential matching this provider
    const [credential] = await db
      .select({ id: providerCredentials.id })
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.agencyId, agencyId),
        eq(providerCredentials.providerCode, pnr.gds as ProviderCode),
        eq(providerCredentials.isActive, true),
      ))
      .limit(1);

    if (!credential) {
      return NextResponse.json(
        { error: `لا توجد بيانات اعتماد نشطة للمزود ${pnr.gds.toUpperCase()}` },
        { status: 422 },
      );
    }

    // Mark sync as in-progress
    await db.update(pnrRecords)
      .set({ syncStatus: 'pending', updatedAt: new Date() })
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));

    const { provider, credentials, providerCode } = await resolveFlightProvider(credential.id, agencyId);

    void logTravelEvent({
      agencyId,
      eventType:    'pnr_sync_started',
      provider:     providerCode,
      resourceId:   pnr.id,
      resourceType: 'pnr',
      actorId:      uid,
      payload:      { pnrCode: pnr.pnrCode },
    });

    const start = Date.now();
    let pnrResult;

    try {
      pnrResult = await provider.retrievePNR(pnr.pnrCode, credentials);
    } catch (err) {
      const durationMs = Date.now() - start;
      await db.update(pnrRecords)
        .set({ syncStatus: 'failed', syncError: String(err), syncedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));

      void logTravelEvent({
        agencyId,
        eventType:    'pnr_sync_failed',
        provider:     providerCode,
        resourceId:   pnr.id,
        resourceType: 'pnr',
        actorId:      uid,
        payload:      { pnrCode: pnr.pnrCode, error: String(err), durationMs },
      });
      void logProviderSync({
        agencyId,
        provider:     providerCode,
        operation:    'sync_pnr',
        status:       'failed',
        referenceId:  pnr.pnrCode,
        errorMessage: String(err),
        durationMs,
      });

      return NextResponse.json({ error: String(err) }, { status: 502 });
    }

    const durationMs = Date.now() - start;
    const now = new Date();

    // Map SegmentInfo → PnrSegmentJson (same mapping as travel/pnr/route.ts)
    const segmentsJson = Array.isArray(pnrResult.segments)
      ? pnrResult.segments.map(s => ({
          from:          s.origin,
          to:            s.destination,
          carrier:       s.airline,
          flightNumber:  s.flightNumber,
          departureDate: s.departureDate,
          departureTime: s.departureTime,
          arrivalDate:   s.arrivalDate,
          arrivalTime:   s.arrivalTime,
          bookingClass:  s.bookingClass,
          fareBasis:     s.fareBasis,
          status:        s.status,
        }))
      : null;

    const passengersJson = Array.isArray(pnrResult.passengers)
      ? pnrResult.passengers.map(p => ({
          type:           p.type,
          firstName:      p.firstName,
          lastName:       p.lastName,
          passportNumber: p.passportNumber  ?? undefined,
          nationality:    p.nationality     ?? undefined,
          dateOfBirth:    p.dateOfBirth     ?? undefined,
        }))
      : null;

    const firstSeg = Array.isArray(pnrResult.segments) ? pnrResult.segments[0] : null;

    const patch: Record<string, unknown> = {
      syncedAt:  now,
      syncStatus: 'success',
      syncError:  null,
      updatedAt:  now,
    };
    if (segmentsJson)              patch['segments']       = segmentsJson;
    if (passengersJson)            patch['passengers']     = passengersJson;
    if (firstSeg?.airline)         patch['airline']        = firstSeg.airline;
    if (firstSeg?.origin)          patch['origin']         = firstSeg.origin;
    if (firstSeg?.destination)     patch['destination']    = firstSeg.destination;
    if (firstSeg?.departureDate)   patch['departureDate']  = firstSeg.departureDate;
    if (pnrResult.expiresAt)       patch['expiresAt']      = new Date(pnrResult.expiresAt);
    if (pnrResult.totalHalalas)    patch['totalHalalas']   = pnrResult.totalHalalas;

    await db.update(pnrRecords)
      .set(patch as Partial<typeof pnrRecords.$inferInsert>)
      .where(and(eq(pnrRecords.id, params.id), eq(pnrRecords.agencyId, agencyId)));

    void logTravelEvent({
      agencyId,
      eventType:    'pnr_sync_completed',
      provider:     providerCode,
      resourceId:   pnr.id,
      resourceType: 'pnr',
      actorId:      uid,
      payload:      { pnrCode: pnr.pnrCode, durationMs },
    });
    void logProviderSync({
      agencyId,
      provider:    providerCode,
      operation:   'sync_pnr',
      status:      'success',
      referenceId: pnr.pnrCode,
      durationMs,
    });
    await logAudit({
      agencyId,
      userId:     uid,
      action:     'update',
      resource:   'pnr',
      resourceId: params.id,
      before:     { syncStatus: pnr.syncStatus, syncedAt: pnr.syncedAt },
      after:      { syncStatus: 'success', syncedAt: now.toISOString() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
