import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const travelEvents = pgTable('travel_events', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  eventType:    text('event_type').notNull(),   // pnr_sync_started|pnr_sync_completed|pnr_sync_failed|
                                                // pnr_linked_to_booking|pnr_linked_to_customer|
                                                // pnr_cancelled|pnr_expired|ticket_issued
  provider:     text('provider'),               // amadeus|sabre|galileo|worldspan|manual
  resourceId:   text('resource_id'),            // PNR or ticket row ID
  resourceType: text('resource_type'),          // pnr|ticket
  actorId:      text('actor_id'),               // Firebase UID or 'system' for cron jobs
  payload:      jsonb('payload'),               // event-specific extra data
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  agencyIdx:    index('travel_events_agency_idx').on(t.agencyId),
  typeIdx:      index('travel_events_type_idx').on(t.eventType),
  providerIdx:  index('travel_events_provider_idx').on(t.provider),
  resourceIdx:  index('travel_events_resource_idx').on(t.resourceId),
}));

export type TravelEvent    = typeof travelEvents.$inferSelect;
export type NewTravelEvent = typeof travelEvents.$inferInsert;
