import { pgTable, text, integer, timestamp, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { pnrRecords } from './pnr';
import { bookings } from './bookings';
import { customers } from './customers';
import { providerCredentials } from './provider-credentials';

/**
 * Operational entity — NOT financial.
 * Chain: PNR → Ticket → Invoice (separate financial step) → Journal Entry
 *
 * ADR-001 locked decisions:
 * - Ticket can exist without a Booking (Amadeus-first / GDS-first flow)
 * - Primary parent is pnrId; bookingId + customerId denormalized from PNR at issuance
 * - Issuance does NOT auto-create an Invoice
 * - Void:     operational event + Credit Note (separate financial step)
 * - Refund:   Refund Request + Payment Voucher in ERP
 * - Exchange: old ticket → new ticket (atomic, two-phase)
 *
 * Status state machine:
 *   pending          → active          (issuance Phase 3 committed)
 *   pending          → void            (provider failed or reconcile gave up)
 *   active           → pending_void    → void       (Phase 2 void sent to provider)
 *   active           → pending_refund  → refunded   (Phase 2 refund sent to provider)
 *   active           → pending_exchange → exchanged  (Phase 2 exchange sent to provider)
 *
 * Two-phase write safety (all operations):
 *   Phase 1: set pending_* status   ← committed before provider call
 *   Phase 2: call provider          ← external; may succeed even if Phase 3 fails
 *   Phase 3: atomic local commit    ← if this fails, reconcile cron heals it
 *
 * pendingOperationPayload stores Phase 2 result so reconciliation can
 * complete Phase 3 without a second provider call.
 */
export const tickets = pgTable('tickets', {
  id:                      text('id').primaryKey(),
  agencyId:                text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  pnrId:                   text('pnr_id').notNull().references(() => pnrRecords.id),
  bookingId:               text('booking_id').references(() => bookings.id),
  customerId:              text('customer_id').references(() => customers.id),
  credentialId:            text('credential_id').references(() => providerCredentials.id),
  // Denormalized from pnr.gds at issuance — avoids JOIN on pnr_records in reports
  issuingProvider:         text('issuing_provider'),
  // NULL while status='pending'; PostgreSQL NULLS DISTINCT allows multiple NULLs
  ticketNumber:            text('ticket_number'),
  passengerName:           text('passenger_name').notNull(),
  issuedAt:                timestamp('issued_at',   { withTimezone: true }),
  expiresAt:               timestamp('expires_at',  { withTimezone: true }),
  status:                  text('status').notNull().default('pending'),
  fareHalalas:             integer('fare_halalas').notNull().default(0),
  taxHalalas:              integer('tax_halalas').notNull().default(0),
  totalHalalas:            integer('total_halalas').notNull().default(0),
  issuedBy:                text('issued_by'),
  voidedAt:                timestamp('voided_at',   { withTimezone: true }),
  voidedBy:                text('voided_by'),
  refundedAt:              timestamp('refunded_at', { withTimezone: true }),
  // Reconciliation tracking
  reconciliationAttempts:  integer('reconciliation_attempts').notNull().default(0),
  lastReconciliationAt:    timestamp('last_reconciliation_at', { withTimezone: true }),
  // Stores Phase 2 result for safe Phase 3 replay (exchange: ExchangeResult)
  pendingOperationPayload: jsonb('pending_operation_payload'),
  createdAt:               timestamp('created_at').notNull().defaultNow(),
  updatedAt:               timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyIdx:      index('tickets_agency_idx').on(t.agencyId),
  pnrIdx:         index('tickets_pnr_idx').on(t.pnrId),
  statusIdx:      index('tickets_status_idx').on(t.status),
  // NULL values are NULLS DISTINCT in PostgreSQL — multiple pending rows allowed
  ticketNumberUq: uniqueIndex('tickets_number_uq').on(t.agencyId, t.ticketNumber),
}));

/**
 * One coupon per flight segment.
 * segmentIndex maps into pnrRecords.segments[n].
 *
 * Coupon events happen at coupon level, not ticket level:
 *   open → used (flight departed) | void | refunded
 */
export const ticketCoupons = pgTable('ticket_coupons', {
  id:           text('id').primaryKey(),
  ticketId:     text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  segmentIndex: integer('segment_index').notNull(),
  couponStatus: text('coupon_status').notNull().default('open'), // open|used|void|refunded
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  ticketIdx: index('coupons_ticket_idx').on(t.ticketId),
}));

export type Ticket          = typeof tickets.$inferSelect;
export type NewTicket       = typeof tickets.$inferInsert;
export type TicketCoupon    = typeof ticketCoupons.$inferSelect;
export type NewTicketCoupon = typeof ticketCoupons.$inferInsert;
