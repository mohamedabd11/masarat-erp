import { pgTable, text, integer, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { agencies }  from './agencies';
import { bookings }  from './bookings';
import { customers } from './customers';

// ── Segment shape stored in segments JSONB ────────────────────────────────────
// Matches the user-facing format close to GDS providers.
// Maps directly from PnrResult.segments (SegmentInfo[]).

export interface PnrSegmentJson {
  from:          string;   // IATA origin
  to:            string;   // IATA destination
  carrier:       string;   // IATA airline code
  flightNumber:  string;   // e.g. SV623
  departureDate: string;   // YYYY-MM-DD
  departureTime: string;   // HH:MM
  arrivalDate:   string;   // YYYY-MM-DD
  arrivalTime:   string;   // HH:MM
  bookingClass:  string;   // e.g. Y
  fareBasis:     string;   // e.g. YOWSV
  status:        string;   // HK|TK|UN|NO
}

// ── Passenger shape stored in passengers JSONB ────────────────────────────────

export interface PnrPassengerJson {
  type:            string;   // ADT|CHD|INF
  firstName:       string;
  lastName:        string;
  passportNumber?: string;
  nationality?:    string;   // ISO 3166-1 alpha-2
  dateOfBirth?:    string;   // YYYY-MM-DD
}

// ── pnr_records table ─────────────────────────────────────────────────────────

export const pnrRecords = pgTable('pnr_records', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),

  // ── GDS identifiers ────────────────────────────────────────────────────────
  pnrCode:        text('pnr_code').notNull(),           // GDS PNR code / Amadeus order ID
  gds:            text('gds'),                           // amadeus|sabre|galileo|manual

  // ── Scalar route fields (legacy, kept for fast queries) ───────────────────
  airline:        text('airline'),                       // primary IATA airline code
  origin:         text('origin'),                        // first departure airport
  destination:    text('destination'),                   // final arrival airport
  departureDate:  text('departure_date'),                // YYYY-MM-DD first leg
  returnDate:     text('return_date'),                   // YYYY-MM-DD return leg

  // ── JSONB structured data (Phase 6-E) ─────────────────────────────────────
  // segments: full multi-segment detail — replaces legacy flight_numbers TEXT
  segments:       jsonb('segments').$type<PnrSegmentJson[]>(),

  // passengers: full passenger list — replaces legacy passenger_names TEXT
  passengers:     jsonb('passengers').$type<PnrPassengerJson[]>(),

  // Legacy JSONB columns (kept for backward compat; new code writes segments/passengers)
  flightNumbers:  jsonb('flight_numbers'),               // deprecated → use segments
  passengerNames: jsonb('passenger_names'),              // deprecated → use passengers
  ticketNumbers:  jsonb('ticket_numbers'),               // still active for ticketing

  // ── Financials ────────────────────────────────────────────────────────────
  passengerCount: integer('passenger_count').notNull().default(1),
  fareHalalas:    integer('fare_halalas').notNull().default(0),
  taxHalalas:     integer('tax_halalas').notNull().default(0),
  totalHalalas:   integer('total_halalas').notNull().default(0),

  // ── Relations (nullable — can create PNR before booking) ─────────────────
  bookingId:      text('booking_id').references(() => bookings.id),
  customerId:     text('customer_id').references(() => customers.id),

  // ── Status lifecycle ──────────────────────────────────────────────────────
  // Allowed values: active | ticketed | cancelled | expired | voided | refunded
  status:         text('status').notNull().default('active'),

  // ── PNR Expiry (TIMESTAMPTZ — Phase 6-E replaces expires_at TEXT) ─────────
  expiresAt:      timestamp('expires_at', { withTimezone: true }),

  // ── Provider Sync tracking (Phase 6-E) ────────────────────────────────────
  syncedAt:       timestamp('synced_at',    { withTimezone: true }),
  syncStatus:     text('sync_status'),    // success | failed | pending
  syncError:      text('sync_error'),     // last error message from retrievePNR

  // ── Soft delete & cancellation (Phase 6-E — replaces hard DELETE) ─────────
  deletedAt:      timestamp('deleted_at',   { withTimezone: true }),
  cancelledAt:    timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy:    text('cancelled_by'),   // Firebase UID who cancelled

  // ── Misc ──────────────────────────────────────────────────────────────────
  notes:          text('notes'),
  createdBy:      text('created_by'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyPnrUq: uniqueIndex('pnr_agency_code_uq').on(t.agencyId, t.pnrCode),
}));

export type PnrRecord    = typeof pnrRecords.$inferSelect;
export type NewPnrRecord = typeof pnrRecords.$inferInsert;
