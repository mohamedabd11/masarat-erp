import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { customers } from './customers';

export const bookings = pgTable('bookings', {
  id:               text('id').primaryKey(),
  agencyId:         text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  bookingNumber:    text('booking_number').notNull(),         // e.g. BK-2024-0001
  serviceType:      text('service_type').notNull(),           // flights|hotels|packages|umrah|insurance|visas|custom
  customTypeId:     text('custom_type_id'),
  customTypeName:   text('custom_type_name'),
  customerId:       text('customer_id').references(() => customers.id),
  customerNameAr:   text('customer_name_ar'),
  customerNameEn:   text('customer_name_en'),
  customerPhone:    text('customer_phone'),
  status:           text('status').notNull().default('confirmed'), // draft|confirmed|completed|cancelled
  totalPriceHalalas:bigint('total_price_halalas', { mode: 'number' }).notNull().default(0),
  costPriceHalalas: bigint('cost_price_halalas', { mode: 'number' }).notNull().default(0),
  profitHalalas:    bigint('profit_halalas', { mode: 'number' }).notNull().default(0),
  paidHalalas:      bigint('paid_halalas', { mode: 'number' }).notNull().default(0),
  currency:         text('currency').notNull().default('SAR'),
  notes:            text('notes'),
  // service-specific details stored as JSON
  details:          jsonb('details'),
  // accounting link
  journalEntryId:   text('journal_entry_id'),
  createdBy:        text('created_by'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_bookings_agency').on(t.agencyId),
  index('idx_bookings_agency_status').on(t.agencyId, t.status),
]);

export type Booking    = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type BookingType =
  | 'flight' | 'hotel' | 'package' | 'umrah' | 'hajj'
  | 'insurance' | 'visa' | 'transport';
