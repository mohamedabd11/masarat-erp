import { db } from '@/lib/db';
import { travelEvents } from '@/lib/schema';
import { randomUUID } from 'crypto';

interface TravelEventParams {
  agencyId:      string;
  eventType:     string;  // pnr_created|ticket_issued|ticket_voided|ticket_refunded|pnr_cancelled|pnr_linked_to_booking|pnr_linked_to_customer|pnr_sync_started|pnr_sync_completed|search
  provider:      string;  // amadeus|galileo|sabre|mock
  resourceId?:   string;
  resourceType?: 'pnr' | 'ticket';
  actorId?:      string;
  payload?:      Record<string, unknown>;
}

export async function logTravelEvent(params: TravelEventParams): Promise<void> {
  try {
    await db.insert(travelEvents).values({
      id:           randomUUID(),
      agencyId:     params.agencyId,
      eventType:    params.eventType,
      provider:     params.provider,
      resourceId:   params.resourceId   ?? null,
      resourceType: params.resourceType ?? null,
      actorId:      params.actorId      ?? null,
      payload:      params.payload      ?? null,
    });
  } catch {
    // log failure must never crash the caller
  }
}
