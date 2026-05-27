import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { invoices } from './invoices';
import { bookings } from './bookings';
import { customers } from './customers';

export const payments = pgTable('payments', {
  id:            text('id').primaryKey(),
  agencyId:      text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  invoiceId:     text('invoice_id').references(() => invoices.id),
  bookingId:     text('booking_id').references(() => bookings.id),
  customerId:    text('customer_id').references(() => customers.id),
  customerName:  text('customer_name'),
  amountHalalas: integer('amount_halalas').notNull(),
  method:        text('method').notNull(),                    // cash|bank_transfer|card|check
  reference:     text('reference'),
  date:          text('date').notNull(),                      // YYYY-MM-DD
  notes:         text('notes'),
  journalEntryId:text('journal_entry_id'),
  createdBy:     text('created_by'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
});

export type Payment    = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// ── Receipt Vouchers (formal payment receipts) ─────────────────────────────

export const receiptVouchers = pgTable('receipt_vouchers', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  voucherNumber:   text('voucher_number').notNull(),
  customerId:      text('customer_id').references(() => customers.id),
  customerName:    text('customer_name'),
  amountHalalas:   integer('amount_halalas').notNull(),
  method:          text('method').notNull(),
  description:     text('description'),
  bookingId:       text('booking_id').references(() => bookings.id),
  invoiceId:       text('invoice_id').references(() => invoices.id),
  date:            text('date').notNull(),
  journalEntryId:  text('journal_entry_id'),
  isRefund:        text('is_refund').default('false'),
  originalVoucherId: text('original_voucher_id'),
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
});

export type ReceiptVoucher    = typeof receiptVouchers.$inferSelect;
export type NewReceiptVoucher = typeof receiptVouchers.$inferInsert;

// ── Supplier Payments (outgoing payments) ─────────────────────────────────

export const supplierPayments = pgTable('supplier_payments', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  bookingId:       text('booking_id').references(() => bookings.id),
  supplierId:      text('supplier_id'),
  supplierName:    text('supplier_name'),
  payeeName:       text('payee_name'),
  amountHalalas:   integer('amount_halalas').notNull(),
  method:          text('method').notNull(),
  reference:       text('reference'),
  bookingNumber:   text('booking_number'),
  date:            text('date').notNull(),
  isRefund:        text('is_refund').default('false'),
  originalPaymentId: text('original_payment_id'),
  journalEntryId:  text('journal_entry_id'),
  createdBy:       text('created_by'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
});

export type SupplierPayment    = typeof supplierPayments.$inferSelect;
export type NewSupplierPayment = typeof supplierPayments.$inferInsert;
