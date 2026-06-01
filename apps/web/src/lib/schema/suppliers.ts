import { pgTable, text, boolean, bigint, timestamp, index } from 'drizzle-orm/pg-core';
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
  balanceHalalas:  bigint('balance_halalas', { mode: 'number' }).notNull().default(0), // positive = we owe them
  notes:           text('notes'),
  isActive:        boolean('is_active').notNull().default(true),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_suppliers_agency').on(t.agencyId),
]);

export type Supplier    = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
