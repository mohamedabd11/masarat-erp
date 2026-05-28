import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { bookings } from './bookings';
import { customers } from './customers';

export const pnrRecords = pgTable('pnr_records', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  pnrCode:         text('pnr_code').notNull(),                  // e.g. ABC123
  gds:             text('gds'),                                  // amadeus|sabre|galileo|worldspan|manual
  airline:         text('airline'),                             // IATA airline code e.g. SV, EK
  flightNumbers:   text('flight_numbers'),                      // e.g. SV123, SV456
  origin:          text('origin'),                              // IATA airport e.g. RUH
  destination:     text('destination'),                         // IATA airport e.g. JED
  departureDate:   text('departure_date'),                      // YYYY-MM-DD
  returnDate:      text('return_date'),
  passengerCount:  integer('passenger_count').notNull().default(1),
  passengerNames:  text('passenger_names'),                     // comma-separated
  ticketNumbers:   text('ticket_numbers'),                      // comma-separated
  fareHalalas:     integer('fare_halalas').notNull().default(0),
  taxHalalas:      integer('tax_halalas').notNull().default(0),
  totalHalalas:    integer('total_halalas').notNull().default(0),
  bookingId:       text('booking_id').references(() => bookings.id),
  customerId:      text('customer_id').references(() => customers.id),
  status:          text('status').notNull().default('active'),  // active|ticketed|cancelled|refunded
  notes:           text('notes'),
  expiresAt:       text('expires_at'),                          // PNR expiry date YYYY-MM-DD
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyPnrUq: uniqueIndex('pnr_agency_code_uq').on(t.agencyId, t.pnrCode),
}));

export type PnrRecord    = typeof pnrRecords.$inferSelect;
export type NewPnrRecord = typeof pnrRecords.$inferInsert;
