import { pgTable, text, integer, boolean, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { bookings } from './bookings';
import { pnrRecords } from './pnr';

// ── Provider Credentials ──────────────────────────────────────────────────────
// Stores per-agency GDS/hotel provider credentials.
// The credentials payload is encrypted at rest (AES-256-GCM via credential-crypto.ts).
// The system never stores plaintext credentials.

export const providerCredentials = pgTable('provider_credentials', {
  id:               text('id').primaryKey(),
  agencyId:         text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  providerCode:     text('provider_code').notNull(),   // amadeus|galileo|sabre|hotelbeds|tbo
  label:            text('label').notNull(),            // human-readable e.g. "Production Amadeus"
  encryptedPayload: text('encrypted_payload').notNull(), // AES-256-GCM: iv:tag:ciphertext (base64url)
  keyVersion:       integer('key_version').notNull().default(1),
  encryptedAt:      timestamp('encrypted_at').notNull().defaultNow(),
  isActive:         boolean('is_active').notNull().default(true),
  createdBy:        text('created_by').notNull(),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('provider_creds_agency_code_label_uq').on(t.agencyId, t.providerCode, t.label),
]);

export type ProviderCredentialRow    = typeof providerCredentials.$inferSelect;
export type NewProviderCredentialRow = typeof providerCredentials.$inferInsert;

// ── Tickets ───────────────────────────────────────────────────────────────────

export const tickets = pgTable('tickets', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  pnrId:          text('pnr_id').references(() => pnrRecords.id),
  bookingId:      text('booking_id').references(() => bookings.id),
  ticketNumber:   text('ticket_number').notNull(),      // 14-digit IATA ticket number
  passengerName:  text('passenger_name').notNull(),
  passengerType:  text('passenger_type').notNull().default('ADT'),  // ADT|CHD|INF
  status:         text('status').notNull().default('issued'),       // issued|voided|refunded|exchanged
  fareHalalas:    integer('fare_halalas').notNull().default(0),
  taxHalalas:     integer('tax_halalas').notNull().default(0),
  totalHalalas:   integer('total_halalas').notNull().default(0),
  currency:       text('currency').notNull().default('SAR'),
  issuedAt:       timestamp('issued_at'),
  voidedAt:       timestamp('voided_at'),
  refundedAt:     timestamp('refunded_at'),
  createdBy:      text('created_by'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('tickets_agency_number_uq').on(t.agencyId, t.ticketNumber),
]);

export type Ticket    = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

// ── Ticket Segments ───────────────────────────────────────────────────────────

export const ticketSegments = pgTable('ticket_segments', {
  id:             text('id').primaryKey(),
  ticketId:       text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  agencyId:       text('agency_id').notNull(),
  segmentNumber:  integer('segment_number').notNull().default(1),
  airline:        text('airline').notNull(),         // IATA airline code e.g. SV
  flightNumber:   text('flight_number').notNull(),
  origin:         text('origin').notNull(),           // IATA airport code
  destination:    text('destination').notNull(),
  departureDate:  text('departure_date').notNull(),  // YYYY-MM-DD
  departureTime:  text('departure_time'),            // HH:MM
  arrivalDate:    text('arrival_date'),
  arrivalTime:    text('arrival_time'),
  cabin:          text('cabin').notNull().default('Y'),         // Y|W|C|F
  bookingClass:   text('booking_class'),
  fareBasis:      text('fare_basis'),
  segmentStatus:  text('segment_status').notNull().default('HK'), // HK|TK|UN|NO
  couponStatus:   text('coupon_status').notNull().default('open'),  // open|used|void|refunded|exchanged
});

export type TicketSegment    = typeof ticketSegments.$inferSelect;
export type NewTicketSegment = typeof ticketSegments.$inferInsert;

// ── Ticket Coupons ────────────────────────────────────────────────────────────

export const ticketCoupons = pgTable('ticket_coupons', {
  id:            text('id').primaryKey(),
  ticketId:      text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  segmentId:     text('segment_id').references(() => ticketSegments.id),
  agencyId:      text('agency_id').notNull(),
  couponNumber:  integer('coupon_number').notNull().default(1),  // 1–4
  couponStatus:  text('coupon_status').notNull().default('open'), // open|used|void|refunded|exchanged
  usedAt:        timestamp('used_at'),
}, (t) => [
  uniqueIndex('ticket_coupons_ticket_num_uq').on(t.ticketId, t.couponNumber),
]);

export type TicketCoupon    = typeof ticketCoupons.$inferSelect;
export type NewTicketCoupon = typeof ticketCoupons.$inferInsert;

// ── Refund Requests ───────────────────────────────────────────────────────────

export const refundRequests = pgTable('refund_requests', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  ticketId:        text('ticket_id').notNull().references(() => tickets.id),
  requestedBy:     text('requested_by').notNull(),
  reason:          text('reason'),
  penaltyHalalas:  integer('penalty_halalas').notNull().default(0),
  refundHalalas:   integer('refund_halalas').notNull().default(0),
  status:          text('status').notNull().default('pending'),   // pending|approved|processed|rejected
  processedAt:     timestamp('processed_at'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

export type RefundRequest    = typeof refundRequests.$inferSelect;
export type NewRefundRequest = typeof refundRequests.$inferInsert;

// ── Provider Sync Logs ────────────────────────────────────────────────────────

export const providerSyncLogs = pgTable('provider_sync_logs', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  provider:     text('provider').notNull(),            // amadeus|galileo|sabre|hotelbeds|tbo|mock
  operation:    text('operation').notNull(),           // search_flights|create_pnr|issue_ticket|void_ticket|refund_ticket
  status:       text('status').notNull(),              // success|failed|retry
  requestId:    text('request_id'),                    // idempotency key
  referenceId:  text('reference_id'),                  // PNR code or ticket number
  durationMs:   integer('duration_ms'),
  errorMessage: text('error_message'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

export type ProviderSyncLog    = typeof providerSyncLogs.$inferSelect;
export type NewProviderSyncLog = typeof providerSyncLogs.$inferInsert;

// ── Travel Events (immutable audit log) ───────────────────────────────────────
// Append-only event log for all GDS/travel operations.
// Never deleted; used for audit trail, debugging, and reconciliation.

export const travelEvents = pgTable('travel_events', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  eventType:    text('event_type').notNull(),   // pnr_created|ticket_issued|ticket_voided|ticket_refunded|pnr_cancelled|search
  provider:     text('provider').notNull(),     // amadeus|galileo|sabre|mock
  resourceId:   text('resource_id'),           // PNR code or ticket number
  resourceType: text('resource_type'),         // pnr|ticket
  actorId:      text('actor_id'),              // Firebase UID of user who triggered
  payload:      jsonb('payload'),              // full event data snapshot
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

export type TravelEvent    = typeof travelEvents.$inferSelect;
export type NewTravelEvent = typeof travelEvents.$inferInsert;
