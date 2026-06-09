import { pgTable, text, integer, bigint, timestamp, index } from 'drizzle-orm/pg-core';

export const groupTrips = pgTable('group_trips', {
  id:                     text('id').primaryKey(),
  agencyId:               text('agency_id').notNull(),
  name:                   text('name').notNull(),
  serviceType:            text('service_type').notNull().default('umrah'),
  departureDate:          text('departure_date'),
  returnDate:             text('return_date'),
  capacity:               integer('capacity'),
  pricePerPersonHalalas:  bigint('price_per_person_halalas', { mode: 'number' }).notNull().default(0),
  status:                 text('status').notNull().default('planning'),
  notes:                  text('notes'),
  createdBy:              text('created_by'),
  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agencyIdx:       index('idx_gt_agency').on(t.agencyId),
  agencyStatusIdx: index('idx_gt_agency_status').on(t.agencyId, t.status),
}));

export const groupTripMembers = pgTable('group_trip_members', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull(),
  groupTripId:     text('group_trip_id').notNull(),
  nameAr:          text('name_ar').notNull(),
  nameEn:          text('name_en'),
  phone:           text('phone'),
  passportNumber:  text('passport_number'),
  passportExpiry:  text('passport_expiry'),
  nationality:     text('nationality'),
  visaStatus:      text('visa_status').notNull().default('pending'),
  visaNumber:      text('visa_number'),
  visaExpiry:      text('visa_expiry'),
  roomType:        text('room_type'),
  notes:           text('notes'),
  status:          text('status').notNull().default('registered'),
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  groupIdx:  index('idx_gtm_group').on(t.groupTripId),
  agencyIdx: index('idx_gtm_agency').on(t.agencyId, t.groupTripId),
}));

export type GroupTrip = typeof groupTrips.$inferSelect;
export type GroupTripMember = typeof groupTripMembers.$inferSelect;
