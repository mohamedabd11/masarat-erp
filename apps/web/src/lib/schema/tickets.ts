import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
 * - Primary parent is pnrId; bookingId + customerId are denormalized from PNR at issuance
 * - Issuance does NOT auto-create an Invoice
 * - Void: operational event + Credit Note (separate financial step)
 * - Refund: Refund Request + Payment Voucher in ERP
 *
 * Two-phase write safety:
 * - ticketNumber is NULL while status='pending' (provider call in-flight or Phase 3 failed)
 * - Reconciliation cron heals 'pending' tickets by calling provider.retrievePNR()
 * - NULL values are NOT equal in PostgreSQL unique indexes (multiple NULLs allowed)
 */
export const tickets = pgTable('tickets', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  pnrId:           text('pnr_id').notNull().references(() => pnrRecords.id),
  bookingId:       text('booking_id').references(() => bookings.id),
  customerId:      text('customer_id').references(() => customers.id),
  credentialId:    text('credential_id').references(() => providerCredentials.id),
  // Denormalized from pnr.gds at issuance time — avoids JOIN on pnr_records in reports
  issuingProvider: text('issuing_provider'),           // amadeus|sabre|galileo|worldspan|manual
  // 13-digit IATA ticket number, e.g. "065-1234567890"
  // NULL while status='pending'; set atomically in Phase 3 transaction
  ticketNumber:    text('ticket_number'),
  passengerName:   text('passenger_name').notNull(),
  issuedAt:        timestamp('issued_at',   { withTimezone: true }),
  expiresAt:       timestamp('expires_at',  { withTimezone: true }),
  // pending → active (normal) | void (provider failed or voided) | refunded | exchanged
  status:          text('status').notNull().default('pending'),
  fareHalalas:     integer('fare_halalas').notNull().default(0),
  taxHalalas:      integer('tax_halalas').notNull().default(0),
  totalHalalas:    integer('total_halalas').notNull().default(0),
  issuedBy:        text('issued_by'),
  voidedAt:        timestamp('voided_at',   { withTimezone: true }),
  voidedBy:        text('voided_by'),
  refundedAt:      timestamp('refunded_at', { withTimezone: true }),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyIdx:      index('tickets_agency_idx').on(t.agencyId),
  pnrIdx:         index('tickets_pnr_idx').on(t.pnrId),
  // Unique per agency — NULL values are NULLS DISTINCT in PostgreSQL (multiple NULLs allowed)
  ticketNumberUq: uniqueIndex('tickets_number_uq').on(t.agencyId, t.ticketNumber),
}));

/**
 * One coupon per flight segment.
 * segmentIndex maps into pnrRecords.segments[n].
 *
 * Coupon lifecycle events happen at coupon level, not ticket level:
 *   open → used (flight departed)
 *   open | used → void (ticket voided)
 *   open → refunded (refund processed)
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
