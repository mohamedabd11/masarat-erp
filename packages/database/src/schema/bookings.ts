/**
 * Bookings — جدول الحجوزات
 * أكثر الجداول تعقيداً: يربط العملاء بالفواتير والمدفوعات والموردين
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  jsonb,
  date,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  bookingTypeEnum,
  bookingStatusEnum,
  paymentStatusEnum,
  revenueModelEnum,
  passengerTypeEnum,
  genderEnum,
  bookingSourceEnum,
  vatCategoryEnum,
} from './enums.js';
import { agencies } from './agencies.js';
import { users } from './users.js';
import { customers } from './customers.js';

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    // نوع وحالة الحجز
    type: bookingTypeEnum('type').notNull(),
    status: bookingStatusEnum('status').notNull().default('draft'),
    source: bookingSourceEnum('source').notNull().default('web'),

    // العميل
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    customerNameAr: varchar('customer_name_ar', { length: 200 }).notNull(),
    customerNameEn: varchar('customer_name_en', { length: 200 }),
    customerPhone: varchar('customer_phone', { length: 20 }),

    // الوكيل المسؤول
    agentId: uuid('agent_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    agentName: varchar('agent_name', { length: 200 }),

    // التسعير (جميع المبالغ بالهللات)
    revenueModel: revenueModelEnum('revenue_model').notNull().default('agent'),
    currency: varchar('currency', { length: 3 }).notNull().default('SAR'),

    // تكلفة الخدمة (ما تدفعه الوكالة للمورد)
    totalCostHalalas: bigint('total_cost_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),
    // رسوم الخدمة (ربح الوكالة المباشر)
    serviceFeeHalalas: bigint('service_fee_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),
    // VAT على رسوم الخدمة أو على كامل السعر (حسب نموذج الإيراد)
    vatAmountHalalas: bigint('vat_amount_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),
    vatCategory: vatCategoryEnum('vat_category').notNull().default('S'),
    // الإجمالي الذي يدفعه العميل
    totalAmountHalalas: bigint('total_amount_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),
    // العمولة (للتقارير فقط)
    commissionHalalas: bigint('commission_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),

    // حالة الدفع
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('unpaid'),
    totalPaidHalalas: bigint('total_paid_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),
    totalDueHalalas: bigint('total_due_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),

    // المورد
    supplierId: uuid('supplier_id'), // references suppliers.id
    supplierName: varchar('supplier_name', { length: 200 }),
    supplierRef: varchar('supplier_ref', { length: 100 }), // PNR / GDS reference

    // تواريخ السفر
    travelDate: date('travel_date'),
    returnDate: date('return_date'),

    // حقول مخصصة (white-label)
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),

    // ملاحظات
    notes: text('notes'),
    internalNotes: text('internal_notes'),

    // إلغاء
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('bookings_agency_id_idx').on(t.agencyId),
    index('bookings_customer_id_idx').on(t.customerId),
    index('bookings_agent_id_idx').on(t.agentId),
    index('bookings_status_idx').on(t.agencyId, t.status),
    index('bookings_type_idx').on(t.agencyId, t.type),
    index('bookings_payment_status_idx').on(t.agencyId, t.paymentStatus),
    index('bookings_travel_date_idx').on(t.agencyId, t.travelDate),
    index('bookings_created_at_idx').on(t.agencyId, t.createdAt),
    // constraint: total_amount = total_cost + service_fee + vat
    check(
      'bookings_amounts_check',
      sql`total_amount_halalas >= 0 AND total_paid_halalas >= 0 AND total_due_halalas >= 0`
    ),
  ]
);

/**
 * ركاب الحجز — منفصل عن bookings (كان array في Firestore)
 * تطبيع relational صحيح
 */
export const bookingPassengers = pgTable(
  'booking_passengers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // الترتيب داخل الحجز
    lineOrder: integer('line_order').notNull().default(1),

    type: passengerTypeEnum('type').notNull().default('adult'),

    // الاسم
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    nameAr: varchar('name_ar', { length: 200 }),

    // بيانات الجواز
    passportNumber: varchar('passport_number', { length: 20 }),
    passportExpiry: date('passport_expiry'),
    nationality: varchar('nationality', { length: 3 }),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),

    // رقم التذكرة (بعد الإصدار)
    ticketNumber: varchar('ticket_number', { length: 30 }),
    ticketIssuedAt: timestamp('ticket_issued_at', { withTimezone: true }),

    // العميل المرتبط (اختياري)
    customerId: uuid('customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('passengers_booking_id_idx').on(t.bookingId),
    index('passengers_agency_id_idx').on(t.agencyId),
  ]
);
