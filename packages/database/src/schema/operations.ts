/**
 * Operations — العمليات الداخلية: Idempotency، ZATCA Queue، Service Types
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
  index,
  unique,
} from 'drizzle-orm/pg-core';
import {
  zatcaQueueStatusEnum,
  zatcaInvoiceTypeCodeEnum,
  zatcaTransactionTypeEnum,
  bookingTypeEnum,
} from './enums.js';
import { agencies } from './agencies.js';
import { invoices } from './accounting.js';

/**
 * مفاتيح الـ Idempotency — يمنع تكرار العمليات المالية
 * يُعادل Firestore idempotency_keys collection
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // مفتاح فريد: {agencyId}_{operation}_{clientKey}
    key: varchar('key', { length: 300 }).notNull(),

    // العملية
    operation: varchar('operation', { length: 50 }).notNull(),
    // create_invoice | process_payment | process_refund | invite_user

    // الحالة
    status: varchar('status', { length: 20 }).notNull().default('success'),
    // success | failed | processing

    // النتيجة المُخزَّنة (لإعادتها عند التكرار)
    result: jsonb('result'),

    // الخطأ (إن فشل)
    errorMessage: text('error_message'),

    // انتهاء الصلاحية (24 ساعة من الإنشاء)
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ikKeyUnique: unique('ik_key_unique').on(t.key),
    ikAgencyIdIdx: index('ik_agency_id_idx').on(t.agencyId),
    ikExpiresAtIdx: index('ik_expires_at_idx').on(t.expiresAt),
    ikOperationIdx: index('ik_operation_idx').on(t.agencyId, t.operation),
  })
);

/**
 * طابور ZATCA — للإرسال غير المتزامن للفواتير الإلكترونية
 * يُعادل Firestore zatca_submission_queue collection
 */
export const zatcaSubmissionQueue = pgTable(
  'zatca_submission_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),

    status: zatcaQueueStatusEnum('status').notNull().default('pending'),

    // بيانات الإرسال
    invoiceTypeCode: zatcaInvoiceTypeCodeEnum('invoice_type_code')
      .notNull()
      .default('388'),
    transactionType: zatcaTransactionTypeEnum('transaction_type')
      .notNull()
      .default('B2C'),

    // XML الموقع (مُشفَّر في object storage)
    signedXmlUrl: text('signed_xml_url'),
    invoiceHash: text('invoice_hash'), // SHA-256 Base64

    // محاولات الإرسال
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),

    // استجابة ZATCA
    zatcaResponse: jsonb('zatca_response'),
    zatcaStatus: varchar('zatca_status', { length: 50 }),
    zatcaClearanceId: varchar('zatca_clearance_id', { length: 100 }),
    zatcaErrorCode: varchar('zatca_error_code', { length: 20 }),

    // رسالة الخطأ
    errorMessage: text('error_message'),

    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    zqAgencyIdIdx: index('zq_agency_id_idx').on(t.agencyId),
    zqInvoiceIdIdx: index('zq_invoice_id_idx').on(t.invoiceId),
    zqStatusIdx: index('zq_status_idx').on(t.status),
    zqNextRetryIdx: index('zq_next_retry_idx').on(t.nextRetryAt), // للـ cron job,
  })
);

/**
 * أنواع الخدمات — Service Types
 * القائمة المرجعية لأنواع الخدمات التي تقدمها الوكالة
 */
export const serviceTypes = pgTable(
  'service_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    bookingType: bookingTypeEnum('booking_type').notNull(),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),

    isEnabled: boolean('is_enabled').notNull().default(true),

    // الإعدادات الخاصة بهذا النوع
    config: jsonb('config').$type<{
      defaultRevenueModel?: 'agent' | 'principal';
      defaultVatCategory?: string;
      requiresPassport?: boolean;
      requiresTravelDate?: boolean;
    }>(),

    displayOrder: integer('display_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    stAgencyIdIdx: index('st_agency_id_idx').on(t.agencyId),
    stAgencyTypeUnique: unique('st_agency_type_unique').on(t.agencyId, t.bookingType),
  })
);

/**
 * VAT Returns — إقرارات ضريبة القيمة المضافة الفصلية
 */
export const vatReturns = pgTable(
  'vat_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    // الفترة (Q1-2026، Q2-2026، إلخ)
    period: varchar('period', { length: 10 }).notNull(), // '2026-Q1'
    year: integer('year').notNull(),
    quarter: integer('quarter').notNull(), // 1-4

    // المبالغ (بالهللات) — bigint لتجنب overflow عند مبالغ > 21.47 مليون ريال
    outputVatHalalas: bigint('output_vat_halalas', { mode: 'number' }).notNull().default(0),
    inputVatHalalas: bigint('input_vat_halalas', { mode: 'number' }).notNull().default(0),
    netVatHalalas: bigint('net_vat_halalas', { mode: 'number' }).notNull().default(0),

    // الحالة
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    // draft | submitted | accepted | rejected

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by'),

    // بيانات التقرير
    reportData: jsonb('report_data'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vrAgencyPeriodUnique: unique('vr_agency_period_unique').on(t.agencyId, t.period),
    vrAgencyIdIdx: index('vr_agency_id_idx').on(t.agencyId),
    vrStatusIdx: index('vr_status_idx').on(t.agencyId, t.status),
  })
);
