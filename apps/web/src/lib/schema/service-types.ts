import { pgTable, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const serviceTypes = pgTable('service_types', {
  id:          text('id').primaryKey(),
  agencyId:    text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  nameAr:      text('name_ar').notNull(),
  nameEn:      text('name_en').notNull(),
  icon:        text('icon').notNull().default('layers'),
  // Revenue recognition mode (IFRS 15 / IFRS Community Principal vs Agent)
  // 'principal' → full selling price is revenue (e.g. tour packages sold on own account)
  // 'agent'     → only commission/fee is revenue (e.g. airline tickets as IATA agent)
  revenueMode: text('revenue_mode').notNull().default('principal'), // principal|agent
  // Per-service VAT rate override (null = use agency default rate)
  vatRate:     integer('vat_rate'),
  // Whether VAT applies to this service type (null = follow agency isVatRegistered)
  isTaxable:   boolean('is_taxable'),
  isActive:    boolean('is_active').notNull().default(true),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

export type ServiceType    = typeof serviceTypes.$inferSelect;
export type NewServiceType = typeof serviceTypes.$inferInsert;
