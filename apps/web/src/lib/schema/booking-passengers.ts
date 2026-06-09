import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Structured per-passenger travel documents for a booking.
 *
 * Replaces the ad-hoc passengers array stored in bookings.details (JSONB).
 * Each row is one traveler on a booking — fully queryable, indexed by passport
 * number for repeat-customer lookup, and properly normalised (not buried in JSON).
 *
 * type: ADT = adult, CHD = child (2–11), INF = infant (<2)
 */
export const bookingPassengers = pgTable('booking_passengers', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull(),
  bookingId:      text('booking_id').notNull(),

  // Identity
  nameAr:         text('name_ar').notNull(),
  nameEn:         text('name_en'),
  type:           text('type').notNull().default('ADT'),  // ADT | CHD | INF
  gender:         text('gender'),                          // M | F

  // Travel documents
  passportNumber: text('passport_number'),
  passportExpiry: text('passport_expiry'),    // YYYY-MM-DD
  nationality:    text('nationality'),
  dateOfBirth:    text('date_of_birth'),      // YYYY-MM-DD
  nationalId:     text('national_id'),

  // Optional
  notes:          text('notes'),

  // Metadata
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:      text('created_by'),
}, (t) => ({
  bookingIdx:  index('idx_bp_agency_booking').on(t.agencyId, t.bookingId),
  passportIdx: index('idx_bp_passport').on(t.agencyId, t.passportNumber),
}));

export type BookingPassenger    = typeof bookingPassengers.$inferSelect;
export type NewBookingPassenger = typeof bookingPassengers.$inferInsert;
