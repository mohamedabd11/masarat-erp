import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';
import { customers } from './customers';

export const bookings = pgTable('bookings', {
  id:               text('id').primaryKey(),
  agencyId:         text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  bookingNumber:    text('booking_number').notNull(),         // e.g. BK-2024-0001
  serviceType:      text('service_type').notNull(),           // flights|hotels|packages|umrah|insurance|visas|custom
  customTypeId:     text('custom_type_id'),
  customTypeName:   text('custom_type_name'),
  customerId:       text('customer_id').references(() => customers.id),
  customerNameAr:   text('customer_name_ar'),
  customerNameEn:   text('customer_name_en'),
  customerPhone:    text('customer_phone'),
  status:           text('status').notNull().default('confirmed'), // draft|confirmed|completed|cancelled
  totalPriceHalalas:bigint('total_price_halalas', { mode: 'number' }).notNull().default(0),
  costPriceHalalas: bigint('cost_price_halalas', { mode: 'number' }).notNull().default(0),
  profitHalalas:    bigint('profit_halalas', { mode: 'number' }).notNull().default(0),
  paidHalalas:      bigint('paid_halalas', { mode: 'number' }).notNull().default(0),
  currency:         text('currency').notNull().default('SAR'),
  notes:            text('notes'),
  // service-specific details stored as JSON
  details:          jsonb('details'),
  // accounting link
  journalEntryId:   text('journal_entry_id'),
  createdBy:        text('created_by'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_bookings_agency').on(t.agencyId),
  index('idx_bookings_agency_status').on(t.agencyId, t.status),
]);

export type Booking    = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type BookingType =
  | 'flight' | 'hotel' | 'package' | 'umrah' | 'hajj'
  | 'insurance' | 'visa' | 'transport';

/**
 * booking_lines — per-service line items within a booking.
 *
 * Each booking may contain multiple service lines (flight + hotel + visa),
 * each with its own VAT rate, revenue model, supplier, and operational state.
 * This is the Source of Truth for per-line VAT, profitability, and GL mapping.
 *
 * Legacy backfill: existing bookings receive one is_legacy=true line that
 * holds the aggregated totals. These lines are immutable and excluded from
 * per-line VAT reports.
 */
export const bookingLines = pgTable('booking_lines', {
  id:                         text('id').primaryKey(),
  bookingId:                  text('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  agencyId:                   text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),

  // Service identification
  serviceType:                text('service_type').notNull(),      // flight|hotel|visa|insurance|transfer|custom
  description:                text('description').notNull(),       // e.g. "الرياض ← القاهرة ذهاب/إياب"

  // Supplier (nullable for in-house services)
  supplierId:                 text('supplier_id'),
  supplierName:               text('supplier_name'),

  // Quantity and cost (what agency pays the supplier — net of VAT)
  quantity:                   integer('quantity').notNull().default(1),
  unitCostHalalas:            bigint('unit_cost_halalas',  { mode: 'number' }).notNull().default(0),
  totalCostHalalas:           bigint('total_cost_halalas', { mode: 'number' }).notNull().default(0),  // = quantity × unitCost

  // Price (what customer pays — EXCLUDING VAT, matching ZATCA invoice_lines convention)
  unitPriceExclVatHalalas:    bigint('unit_price_excl_vat_halalas',  { mode: 'number' }).notNull().default(0),
  totalPriceExclVatHalalas:   bigint('total_price_excl_vat_halalas', { mode: 'number' }).notNull().default(0), // = quantity × unitPrice

  // VAT per-line — this is the core value this table provides
  // S=Standard(15%) | Z=Zero-rated | E=Exempt | O=Out-of-scope
  vatCategory:                text('vat_category').notNull().default('S'),
  vatRateBps:                 integer('vat_rate_bps').notNull().default(1500), // 1500=15%, 0=0%
  vatHalalas:                 bigint('vat_halalas', { mode: 'number' }).notNull().default(0), // = totalPriceExclVat × vatRateBps / 10000

  // Revenue model per-line (determines GL account and IFRS 15 recognition)
  revenueModel:               text('revenue_model').notNull().default('agent'), // agent|principal

  // GL account mapping per-line (overrides agency-level defaults if set)
  revenueAccountCode:         text('revenue_account_code'),  // e.g. 4001 for flights, 4002 for hotels
  costAccountCode:            text('cost_account_code'),     // e.g. 5001 for flight costs

  // Operational state — SEPARATE from booking.status (commercial lifecycle)
  // booking.status = draft|confirmed|completed|cancelled  (commercial/financial)
  // operationalStatus = pending|confirmed|ticketed|issued|cancelled  (operational/supplier)
  operationalStatus:          text('operational_status').notNull().default('pending'),
  pnrReference:               text('pnr_reference'),   // GDS PNR for flights
  voucherNumber:              text('voucher_number'),   // voucher ref for hotels

  // Legacy flag: true = auto-created from pre-booking_lines booking.
  // Immutable — never updated, never used in per-line VAT/GL calculations.
  isLegacy:                   boolean('is_legacy').notNull().default(false),

  // Line status
  status:                     text('status').notNull().default('active'), // active|cancelled|refunded
  cancelledAt:                timestamp('cancelled_at'),
  refundHalalas:              bigint('refund_halalas', { mode: 'number' }).notNull().default(0),

  sortOrder:                  integer('sort_order').notNull().default(0),
  notes:                      text('notes'),

  createdAt:                  timestamp('created_at').notNull().defaultNow(),
  updatedAt:                  timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_bl_booking').on(t.bookingId),
  index('idx_bl_agency').on(t.agencyId),
  index('idx_bl_agency_service').on(t.agencyId, t.serviceType),
  index('idx_bl_status').on(t.agencyId, t.status),
]);

export type BookingLine    = typeof bookingLines.$inferSelect;
export type NewBookingLine = typeof bookingLines.$inferInsert;

export type VatCategory = 'S' | 'Z' | 'E' | 'O';
export const VAT_RATE_BPS: Record<VatCategory, number> = {
  S: 1500,  // Standard 15%
  Z: 0,     // Zero-rated
  E: 0,     // Exempt
  O: 0,     // Out of scope
};
