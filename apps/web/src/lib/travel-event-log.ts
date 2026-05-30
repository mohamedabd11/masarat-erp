import { db } from './db';
import { travelEvents } from './schema/travel-events';

interface TravelEventParams {
  agencyId:      string;
  eventType:     string;
  provider?:     string;
  resourceId?:   string;
  resourceType?: 'pnr' | 'ticket';
  actorId?:      string;
  payload?:      unknown;
}

/**
 * Fire-and-forget travel event log.
 * Never throws — caller must not await if it wants non-blocking behaviour.
 *
 * Event semantics:
 *   pnr_sync_completed = success path only (no payload.success field)
 *   pnr_sync_failed    = failure path (separate queryable event)
 *   Rationale: WHERE event_type='pnr_sync_failed' >> WHERE payload->>'success'='false'
 */
export async function logTravelEvent(p: TravelEventParams): Promise<void> {
  try {
    await db.insert(travelEvents).values({
      id:           crypto.randomUUID(),
      agencyId:     p.agencyId,
      eventType:    p.eventType,
      provider:     p.provider     ?? null,
      resourceId:   p.resourceId   ?? null,
      resourceType: p.resourceType ?? null,
      actorId:      p.actorId      ?? null,
      payload:      (p.payload     ?? null) as never,
    });
  } catch {
    console.error(JSON.stringify({ event: 'travel_event_log_failed', eventType: p.eventType }));
  }
}
