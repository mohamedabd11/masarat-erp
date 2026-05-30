import { pgTable, text, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { customers } from './customers';

export const quotes = pgTable('quotes', {
  id:                   text('id').primaryKey(),
  agencyId:             text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  quoteNumber:          text('quote_number').notNull(),
  customerId:           text('customer_id').references(() => customers.id),
  customerName:         text('customer_name'),
  customerPhone:        text('customer_phone'),
  items:                jsonb('items'),                              // array of line items
  totalHalalas:         integer('total_halalas').notNull().default(0),
  status:               text('status').notNull().default('draft'),   // draft|sent|accepted|rejected|expired|converted
  validUntil:           text('valid_until'),
  notes:                text('notes'),
  convertedToBookingId: text('converted_to_booking_id'),             // set when status=converted
  convertedAt:          timestamp('converted_at'),
  createdBy:            text('created_by'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyQuoteNumberUq: uniqueIndex('quotes_agency_number_uq').on(t.agencyId, t.quoteNumber),
}));

export type Quote    = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
