import { pgTable, text, integer, bigint, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { customers } from './customers';

export const recurringInvoices = pgTable('recurring_invoices', {
  id:                text('id').primaryKey(),
  agencyId:          text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  customerId:        text('customer_id').references(() => customers.id),
  title:             text('title').notNull(),
  // Amounts (template — copied to each generated invoice)
  subtotalHalalas:   bigint('subtotal_halalas', { mode: 'number' }).notNull().default(0),
  vatHalalas:        bigint('vat_halalas', { mode: 'number' }).notNull().default(0),
  totalHalalas:      bigint('total_halalas', { mode: 'number' }).notNull().default(0),
  items:             jsonb('items'),
  notes:             text('notes'),
  // Schedule
  frequency:         text('frequency').notNull().default('monthly'), // weekly|monthly|quarterly|yearly
  dayOfMonth:        integer('day_of_month'),                         // 1–28, which day to issue
  startDate:         text('start_date').notNull(),                    // YYYY-MM-DD
  endDate:           text('end_date'),                                // null = indefinite
  // Tracking
  lastIssuedAt:      text('last_issued_at'),                          // YYYY-MM-DD of last generation
  nextIssueAt:       text('next_issue_at').notNull(),                 // YYYY-MM-DD of next generation
  totalIssued:       integer('total_issued').notNull().default(0),
  isActive:          boolean('is_active').notNull().default(true),
  // Buyer snapshot
  buyerNameAr:       text('buyer_name_ar'),
  paymentMethod:     text('payment_method'),
  createdBy:         text('created_by'),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
});

export type RecurringInvoice    = typeof recurringInvoices.$inferSelect;
export type NewRecurringInvoice = typeof recurringInvoices.$inferInsert;
