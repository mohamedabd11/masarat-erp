import { pgTable, text, bigint, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const customers = pgTable('customers', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  nameAr:         text('name_ar').notNull(),
  nameEn:         text('name_en'),
  phone:          text('phone'),
  email:          text('email'),
  passportNumber: text('passport_number'),
  nationalId:     text('national_id'),
  nationality:    text('nationality'),
  dateOfBirth:    text('date_of_birth'),
  notes:          text('notes'),
  creditLimitHalalas:    bigint('credit_limit_halalas', { mode: 'number' }).notNull().default(0),  // 0 = no limit
  openingBalanceHalalas: bigint('opening_balance_halalas', { mode: 'number' }).notNull().default(0), // AR opening balance for migration
  isActive:       boolean('is_active').notNull().default(true),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_customers_agency').on(t.agencyId),
]);

export type Customer    = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
