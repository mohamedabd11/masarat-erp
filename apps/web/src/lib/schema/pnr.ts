import { pgTable, text, integer, bigint, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { bookings } from './bookings';
import { customers } from './customers';

export interface PnrSegmentJson {
  from:          string;   // IATA origin airport
  to:            string;   // IATA destination airport
  carrier:       string;   // IATA airline code
  flightNumber?: string;
  departureAt?:  string;   // ISO-8601 datetime
  arrivalAt?:    string;
  cabin?:        string;   // Y|W|C|F
}

export interface PnrPassengerJson {
  name:            string;
  type:            'ADT' | 'CHD' | 'INF';
  passportNumber?: string;
  dateOfBirth?:    string;
  nationality?:    string;
  ticketNumber?:   string;
}

export const pnrRecords = pgTable('pnr_records', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  pnrCode:        text('pnr_code').notNull(),              // e.g. ABC123
  gds:            text('gds'),                              // amadeus|sabre|galileo|worldspan|manual
  airline:        text('airline'),                         // IATA airline code e.g. SV, EK
  flightNumbers:  text('flight_numbers'),                  // e.g. SV123, SV456 (legacy flat field)
  origin:         text('origin'),                          // IATA airport e.g. RUH
  destination:    text('destination'),                     // IATA airport e.g. JED
  departureDate:  text('departure_date'),                  // YYYY-MM-DD
  returnDate:     text('return_date'),
  passengerCount: integer('passenger_count').notNull().default(1),
  passengerNames: text('passenger_names'),                 // legacy comma-separated
  ticketNumbers:  text('ticket_numbers'),                  // legacy comma-separated
  segments:       jsonb('segments').$type<PnrSegmentJson[]>(),
  passengers:     jsonb('passengers').$type<PnrPassengerJson[]>(),
  fareHalalas:    bigint('fare_halalas', { mode: 'number' }).notNull().default(0),
  taxHalalas:     bigint('tax_halalas', { mode: 'number' }).notNull().default(0),
  totalHalalas:   bigint('total_halalas', { mode: 'number' }).notNull().default(0),
  bookingId:      text('booking_id').references(() => bookings.id),
  customerId:     text('customer_id').references(() => customers.id),
  status:         text('status').notNull().default('active'), // active|ticketed|cancelled|expired|voided|refunded
  syncStatus:     text('sync_status'),                     // pending|success|failed
  notes:          text('notes'),
  expiresAt:      timestamp('expires_at', { withTimezone: true }),
  cancelledAt:    timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy:    text('cancelled_by'),
  deletedAt:      timestamp('deleted_at', { withTimezone: true }),
  createdBy:      text('created_by'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyPnrUq: uniqueIndex('pnr_agency_code_uq').on(t.agencyId, t.pnrCode),
}));

export type PnrRecord    = typeof pnrRecords.$inferSelect;
export type NewPnrRecord = typeof pnrRecords.$inferInsert;
