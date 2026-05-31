import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

/**
 * Canonical event taxonomy — do not add ad-hoc strings outside this list.
 *
 * PNR lifecycle:
 *   pnr_sync_started         provider sync initiated
 *   pnr_sync_completed       provider sync succeeded (success path only)
 *   pnr_sync_failed          provider sync failed    (separate from completed for queryability)
 *   pnr_linked_to_booking    PNR associated with a booking record
 *   pnr_linked_to_customer   PNR associated with a customer record
 *   pnr_cancelled            PNR marked cancelled in system (local only)
 *   pnr_expired              PNR expired — set by cron, not user action
 *
 * Ticket issuance:
 *   ticket_issued            Phase 3 committed: ticket active, PNR ticketed
 *   ticket_issue_failed      provider.issueTicket() failed (Phase 2 failure)
 *
 * Ticket void:
 *   ticket_voided            Phase 3 committed: ticket void, coupons void
 *   ticket_void_failed       provider.voidTicket() failed (Phase 2 failure)
 *
 * Ticket refund:
 *   ticket_refunded          Phase 3 committed: ticket refunded
 *   ticket_refund_failed     provider.refundTicket() failed (Phase 2 failure)
 *
 * Ticket exchange:
 *   ticket_exchanged         Phase 3 committed: old exchanged, new ticket created
 *   ticket_exchange_failed   provider.exchangeTicket() failed (Phase 2 failure)
 *
 * Reconciliation:
 *   ticket_reconciled        cron healed a pending_* ticket successfully
 *   ticket_reconcile_failed  ticket exceeded attempt threshold — voided or reset
 *
 * Idempotency note:
 *   *_completed / *_issued  ≠  *_failed  (never a success:boolean in payload)
 *   Reason: WHERE event_type='ticket_refund_failed' >> WHERE payload->>'success'='false'
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
