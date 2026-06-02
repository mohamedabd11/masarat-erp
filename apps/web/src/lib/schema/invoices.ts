import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { bookings } from './bookings';
import { customers } from './customers';

export const invoices = pgTable('invoices', {
  id:                text('id').primaryKey(),
  agencyId:          text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  invoiceNumber:     text('invoice_number').notNull(),
  type:              text('type').notNull().default('380'),   // 380=invoice 381=credit 383=debit
  bookingId:         text('booking_id').references(() => bookings.id),
  customerId:        text('customer_id').references(() => customers.id),
  // seller info (snapshot)
  sellerNameAr:      text('seller_name_ar'),
  sellerNameEn:      text('seller_name_en'),
  sellerVatNumber:   text('seller_vat_number'),
  sellerCrNumber:    text('seller_cr_number'),
  sellerAddress:     text('seller_address'),
  // buyer info (snapshot)
  buyerNameAr:       text('buyer_name_ar'),
  buyerNameEn:       text('buyer_name_en'),
  buyerPhone:        text('buyer_phone'),
  buyerEmail:        text('buyer_email'),
  buyerNationalId:   text('buyer_national_id'),
  // amounts
  subtotalHalalas:   bigint('subtotal_halalas', { mode: 'number' }).notNull().default(0),
  vatHalalas:        bigint('vat_halalas', { mode: 'number' }).notNull().default(0),
  totalHalalas:      bigint('total_halalas', { mode: 'number' }).notNull().default(0),
  paidHalalas:       bigint('paid_halalas', { mode: 'number' }).notNull().default(0),
  // dates
  issueDate:         text('issue_date').notNull(),            // YYYY-MM-DD
  supplyDate:        text('supply_date'),
  dueDate:           text('due_date'),
  // status
  status:            text('status').notNull().default('issued'), // draft|issued|paid|partial|credited|cancelled|refunded
  paymentMethod:     text('payment_method'),
  paymentRef:        text('payment_ref'),
  // ZATCA
  zatcaUuid:         text('zatca_uuid'),
  zatcaHash:         text('zatca_hash'),
  isEInvoice:        boolean('is_e_invoice').notNull().default(false),
  // items stored as JSON array
  items:             jsonb('items'),
  notes:             text('notes'),
  originalInvoiceId: text('original_invoice_id'),  // for credit/debit notes (type 381/383)
  // IFRS 15 deferred revenue: for future-dated Umrah/Hajj/package invoices the
  // revenue is recognised on the travel date, not at issuance.
  deferredUntil:      text('deferred_until'),           // YYYY-MM-DD travel date (null = recognised immediately)
  revenueRecognizedAt: text('revenue_recognized_at'),   // YYYY-MM-DD when Dr 3201 / Cr 4100 was posted
  journalEntryId:    text('journal_entry_id'),
  createdBy:         text('created_by'),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_invoices_agency').on(t.agencyId),
  index('idx_invoices_agency_status').on(t.agencyId, t.status),
  index('idx_invoices_agency_created').on(t.agencyId, t.createdAt),
  // Uniqueness for one invoice per booking is enforced by the partial index
  // invoices_one_per_booking (defined in setup-db, scoped to type='380' only) so
  // that credit notes (381) and refunds can share a bookingId with the original.
]);

export type Invoice    = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
