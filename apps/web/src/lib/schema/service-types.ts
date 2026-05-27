import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const serviceTypes = pgTable('service_types', {
  id:        text('id').primaryKey(),
  agencyId:  text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  nameAr:    text('name_ar').notNull(),
  nameEn:    text('name_en').notNull(),
  icon:      text('icon').notNull().default('layers'),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ServiceType    = typeof serviceTypes.$inferSelect;
export type NewServiceType = typeof serviceTypes.$inferInsert;
