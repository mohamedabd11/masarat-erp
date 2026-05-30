/**
 * Customers — جدول العملاء مع loyalty وتتبع الحالة
 */
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  bigint,
  jsonb,
  text,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { customerTypeEnum, customerTierEnum, genderEnum } from './enums.js';
import { agencies } from './agencies.js';
import { users } from './users.js';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // التصنيف
    type: customerTypeEnum('type').notNull().default('individual'),
    tier: customerTierEnum('tier').notNull().default('standard'),

    // البيانات الأساسية
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    gender: genderEnum('gender'),
    nationality: varchar('nationality', { length: 3 }), // ISO 3166-1 alpha-3
    mobile: varchar('mobile', { length: 20 }),
    email: varchar('email', { length: 255 }),

    // بيانات الشركة (إن كان type = company)
    companyVatNumber: varchar('company_vat_number', { length: 15 }),
    companyCrNumber: varchar('company_cr_number', { length: 20 }),

    // Tags للتصنيف المرن
    tags: jsonb('tags').$type<string[]>().default([]),

    // برنامج الولاء
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    loyaltyPointsTotal: integer('loyalty_points_total').notNull().default(0),

    // الإحصائيات (تُحدَّث عند كل حجز/دفع)
    totalBookings: integer('total_bookings').notNull().default(0),
    // bigint لأن المبالغ المتراكمة قد تتجاوز 2 مليار هللة
    totalSpentHalalas: bigint('total_spent_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),
    lastBookingAt: timestamp('last_booking_at', { withTimezone: true }),

    // علامات تحذيرية
    hasUnpaidBalance: boolean('has_unpaid_balance').notNull().default(false),
    isBlacklisted: boolean('is_blacklisted').notNull().default(false),
    blacklistReason: text('blacklist_reason'),

    // المسؤول عن العميل
    assignedAgentId: uuid('assigned_agent_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    customersAgencyIdIdx: index('customers_agency_id_idx').on(t.agencyId),
    customersMobileIdx: index('customers_mobile_idx').on(t.agencyId, t.mobile),
    customersEmailIdx: index('customers_email_idx').on(t.agencyId, t.email),
    customersTypeTierIdx: index('customers_type_tier_idx').on(t.agencyId, t.type, t.tier),
    customersIsBlacklistedIdx: index('customers_is_blacklisted_idx').on(t.agencyId, t.isBlacklisted),
  })
);

/**
 * جوازات السفر — منفصلة لأن العميل الواحد قد يملك أكثر من جواز
 */
export const customerPassports = pgTable(
  'customer_passports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    passportNumber: varchar('passport_number', { length: 20 }).notNull(),
    nationality: varchar('nationality', { length: 3 }),
    expiryDate: date('expiry_date'),
    issueDate: date('issue_date'),
    issueCountry: varchar('issue_country', { length: 3 }),

    // اسم صاحب الجواز (قد يختلف عن اسم العميل)
    firstNameEn: varchar('first_name_en', { length: 100 }),
    lastNameEn: varchar('last_name_en', { length: 100 }),
    firstNameAr: varchar('first_name_ar', { length: 100 }),
    lastNameAr: varchar('last_name_ar', { length: 100 }),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),

    isPrimary: boolean('is_primary').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    passportsCustomerIdIdx: index('passports_customer_id_idx').on(t.customerId),
    passportsAgencyNumberIdx: index('passports_agency_number_idx').on(t.agencyId, t.passportNumber),
  })
);
