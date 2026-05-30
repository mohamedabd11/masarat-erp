import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

/**
 * Canonical event taxonomy — do not add ad-hoc strings.
 *
 * PNR lifecycle:
 *   pnr_sync_started       provider sync initiated
 *   pnr_sync_completed     provider sync succeeded (success path only — separate from failed)
 *   pnr_sync_failed        provider sync failed   (separate event for queryability)
 *   pnr_linked_to_booking  PNR associated with a booking record
 *   pnr_linked_to_customer PNR associated with a customer record
 *   pnr_cancelled          PNR marked cancelled in system (local only — provider cancel is separate)
 *   pnr_expired            PNR expired — set by cron job, not by user action
 *
 * Ticket lifecycle:
 *   ticket_issued           provider.issueTicket() succeeded, ticket record activated
 *   ticket_issue_failed     provider.issueTicket() failed before or after local write
 *   ticket_reconciled       reconciliation cron healed a 'pending' ticket after Phase 3 failure
 *   ticket_reconcile_failed pending ticket >24h old with no provider ticket found — voided
 *   ticket_voided           ticket voided operationally (Credit Note is a separate financial step)
 *   ticket_refunded         refund processed (Refund Request + Payment Voucher are separate)
 *   ticket_exchanged        ticket exchanged for a new itinerary
 *
 * Idempotency note:
 *   pnr_sync_completed ≠ pnr_sync_failed (not success:boolean in payload)
 *   Reason: WHERE event_type='pnr_sync_failed' >> WHERE payload->>'success'='false'
 */
export const travelEvents = pgTable('travel_events', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  eventType:    text('event_type').notNull(),
  provider:     text('provider'),               // amadeus|sabre|galileo|worldspan|manual
  resourceId:   text('resource_id'),            // PNR or ticket row ID
  resourceType: text('resource_type'),          // pnr|ticket
  actorId:      text('actor_id'),               // Firebase UID or 'system' for cron jobs
  payload:      jsonb('payload'),               // event-specific extra data
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  agencyIdx:   index('travel_events_agency_idx').on(t.agencyId),
  typeIdx:     index('travel_events_type_idx').on(t.eventType),
  providerIdx: index('travel_events_provider_idx').on(t.provider),
  resourceIdx: index('travel_events_resource_idx').on(t.resourceId),
}));

export type TravelEvent    = typeof travelEvents.$inferSelect;
export type NewTravelEvent = typeof travelEvents.$inferInsert;
