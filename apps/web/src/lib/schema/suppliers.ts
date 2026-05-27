import { pgTable, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const suppliers = pgTable('suppliers', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  nameAr:          text('name_ar').notNull(),
  nameEn:          text('name_en'),
  type:            text('type'),                              // airline|hotel|tour_operator|other
  phone:           text('phone'),
  email:           text('email'),
  accountNumber:   text('account_number'),
  vatNumber:       text('vat_number'),
  balanceHalalas:  integer('balance_halalas').notNull().default(0), // positive = we owe them
  notes:           text('notes'),
  isActive:        boolean('is_active').notNull().default(true),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

export type Supplier    = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
