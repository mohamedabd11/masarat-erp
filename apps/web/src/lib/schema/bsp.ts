/**
 * BSP (Billing Settlement Plan) schema for IATA-accredited travel agencies.
 *
 * BSP is IATA's global financial settlement system:
 * - bspBillings:     Monthly billing from IATA (tickets sold × net remit amount)
 * - bspAdjustments:  ADM (Agency Debit Memo) and ACM (Agency Credit Memo) adjustments
 *
 * GL flow (weekly/fortnightly BSP payment):
 *   DR: BSP Clearing (1350) / CR: Bank (1100)          — BSP remittance payment
 *   DR: ADM Expense (5420)  / CR: BSP Clearing (1350)  — on receiving an ADM
 *   DR: BSP Clearing (1350) / CR: ADM Recovery (4420)  — on receiving an ACM
 */
import { pgTable, text, bigint, boolean, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const bspBillings = pgTable('bsp_billings', {
  id:                   text('id').primaryKey(),
  agencyId:             text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  billingPeriod:        text('billing_period').notNull(),         // YYYY-MM (month) or YYYY-Www (week)
  periodType:           text('period_type').notNull().default('monthly'), // monthly|weekly|fortnightly
  totalSalesHalalas:    bigint('total_sales_halalas', { mode: 'number' }).notNull().default(0),   // gross ticket sales
  totalRefundsHalalas:  bigint('total_refunds_halalas', { mode: 'number' }).notNull().default(0), // refund/void amounts
  totalCommissionHalalas: bigint('total_commission_halalas', { mode: 'number' }).notNull().default(0), // agency commission earned
  netRemitHalalas:      bigint('net_remit_halalas', { mode: 'number' }).notNull(),   // amount due to IATA/BSP
  currency:             text('currency').notNull().default('SAR'),
  dueDate:             text('due_date').notNull(),                 // YYYY-MM-DD
  status:              text('status').notNull().default('pending'), // pending|paid|overdue|disputed
  paymentDate:         text('payment_date'),
  bankAccountId:       text('bank_account_id'),
  journalEntryId:      text('journal_entry_id'),
  reference:           text('reference'),
  notes:               text('notes'),
  createdBy:           text('created_by'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

export type BspBilling    = typeof bspBillings.$inferSelect;
export type NewBspBilling = typeof bspBillings.$inferInsert;

export const bspAdjustments = pgTable('bsp_adjustments', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  type:            text('type').notNull(),                        // ADM|ACM
  referenceNumber: text('reference_number').notNull(),           // IATA ADM/ACM reference number
  issueDate:       text('issue_date').notNull(),
  dueDate:         text('due_date'),
  amountHalalas:   bigint('amount_halalas', { mode: 'number' }).notNull(),
  currency:        text('currency').notNull().default('SAR'),
  reason:          text('reason').notNull(),
  airlineCode:     text('airline_code'),
  ticketNumbers:   text('ticket_numbers'),                       // comma-separated
  status:          text('status').notNull().default('pending'),  // pending|accepted|disputed|paid|credited
  bspBillingId:    text('bsp_billing_id').references(() => bspBillings.id),
  journalEntryId:  text('journal_entry_id'),
  notes:           text('notes'),
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

export type BspAdjustment    = typeof bspAdjustments.$inferSelect;
export type NewBspAdjustment = typeof bspAdjustments.$inferInsert;

// BSP clearing account code
export const BSP_CLEARING_CODE = '1350';
export const BSP_PAYABLE_CODE  = '2150';
