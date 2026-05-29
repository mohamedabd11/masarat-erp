/**
 * Agencies — جدول الوكالات (Tenants)
 * هذا الجدول هو أصل كل شيء في نظام Multi-tenant
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import {
  subscriptionPlanEnum,
  subscriptionStatusEnum,
} from './enums.js';

/**
 * جدول الوكالات — كل صف = tenant منفصل
 * agency_id يُستخدم كـ RLS policy discriminator في جميع الجداول الأخرى
 */
export const agencies = pgTable(
  'agencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // المعلومات الأساسية
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),

    // معلومات الاشتراك التجاري
    crNumber: varchar('cr_number', { length: 20 }),
    vatNumber: varchar('vat_number', { length: 15 }),
    address: jsonb('address').$type<{
      buildingNumber?: string;
      streetName?: string;
      district?: string;
      city?: string;
      postalCode?: string;
      additionalNumber?: string;
      countryCode: string;
    }>(),

    // الاشتراك والحالة
    subscriptionPlan: subscriptionPlanEnum('subscription_plan')
      .notNull()
      .default('trial'),
    subscriptionStatus: subscriptionStatusEnum('subscription_status')
      .notNull()
      .default('trial'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    subscriptionEndsAt: timestamp('subscription_ends_at', { withTimezone: true }),

    // حدود الخطة
    maxUsers: integer('max_users').notNull().default(2),
    maxBookingsPerMonth: integer('max_bookings_per_month'),

    // الإعدادات
    isActive: boolean('is_active').notNull().default(true),
    logoUrl: text('logo_url'),
    primaryColor: varchar('primary_color', { length: 7 }).default('#1a56db'),

    // Firebase UID للـ admin الأساسي (للـ migration)
    firebaseAdminUid: varchar('firebase_admin_uid', { length: 128 }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('agencies_cr_number_idx').on(t.crNumber),
    index('agencies_vat_number_idx').on(t.vatNumber),
    index('agencies_subscription_status_idx').on(t.subscriptionStatus),
  ]
);

/**
 * إعدادات المحاسبة لكل وكالة
 * منفصل عن agencies لتجنب تضخم الجدول الرئيسي
 */
export const agencyAccountingConfigs = pgTable(
  'agency_accounting_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' })
      .unique(),

    // معدل VAT الافتراضي (مخزن كـ integer: 1500 = 15%)
    vatRateBps: integer('vat_rate_bps').notNull().default(1500),

    // خريطة الحسابات كـ JSONB (مرونة عالية)
    accountMapping: jsonb('account_mapping').$type<{
      mainCashAccount: string;
      mainBankAccount: string;
      bspClearingAccount: string;
      customerDepositsAccount: string;
      deferredRevenueAccount: string;
      commissionFlightDomestic: string;
      commissionFlightInternational: string;
      commissionHotelDomestic: string;
      commissionHotelInternational: string;
      commissionUmrahHajj: string;
      commissionInsurance: string;
      serviceFees: string;
      packageRevenue: string;
      flightCostAccount: string;
      hotelCostAccount: string;
      packageCostAccount: string;
      airlinePayableAccount: string;
      hotelPayableAccount: string;
      umrahPayableAccount: string;
      insurancePayableAccount: string;
      vatOutputAccount: string;
      vatInputAccount: string;
      roundingDifferenceAccount: string;
    }>(),

    // نموذج الإيراد الافتراضي لكل نوع حجز
    defaultRevenueModels: jsonb('default_revenue_models').$type<
      Partial<
        Record<
          | 'flight'
          | 'hotel'
          | 'package'
          | 'umrah'
          | 'hajj'
          | 'insurance'
          | 'visa'
          | 'transport',
          'agent' | 'principal'
        >
      >
    >(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

/**
 * إعدادات ZATCA لكل وكالة
 * معلومات الشهادات الرقمية وبيانات البائع
 */
export const agencyZatcaConfigs = pgTable('agency_zatca_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' })
    .unique(),

  // بيانات البائع
  sellerNameAr: varchar('seller_name_ar', { length: 200 }).notNull(),
  sellerNameEn: varchar('seller_name_en', { length: 200 }).notNull(),
  vatNumber: varchar('vat_number', { length: 15 }).notNull(),
  crNumber: varchar('cr_number', { length: 20 }),
  sellerAddress: jsonb('seller_address').$type<{
    buildingNumber: string;
    streetName: string;
    district: string;
    city: string;
    postalCode: string;
    additionalNumber?: string;
    countryCode: string;
  }>(),

  // بيانات الشهادة (مُشفَّرة — لا تُخزَّن المفاتيح الخاصة هنا)
  certificateSerial: varchar('certificate_serial', { length: 100 }),
  certificateExpiresAt: timestamp('certificate_expires_at', {
    withTimezone: true,
  }),

  // البيئة
  environment: varchar('environment', { length: 20 })
    .notNull()
    .default('simulation'),

  // آخر فاتورة مُعتمدة (لـ invoice hash chaining)
  lastInvoiceHash: text('last_invoice_hash'),
  lastInvoiceNumber: varchar('last_invoice_number', { length: 30 }),

  isEnabled: boolean('is_enabled').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
