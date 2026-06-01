import { pgTable, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const agencies = pgTable('agencies', {
  id:                   text('id').primaryKey(),           // nanoid
  nameAr:               text('name_ar').notNull(),
  nameEn:               text('name_en'),
  email:                text('email'),
  phone:                text('phone'),
  addressAr:            text('address_ar'),
  addressEn:            text('address_en'),
  city:                 text('city'),
  country:              text('country').default('SA'),
  vatNumber:            text('vat_number'),
  crNumber:             text('cr_number'),
  logoUrl:              text('logo_url'),
  // subscription — single-plan model
  plan:                 text('plan').notNull().default('trial'),           // trial|active|lifetime (no tier)
  subscriptionStatus:   text('subscription_status').notNull().default('trial'), // trial|active|suspended|expired|lifetime
  trialStartsAt:        timestamp('trial_starts_at', { withTimezone: true }),
  trialEndDate:         timestamp('trial_end_date', { withTimezone: true }),
  subscriptionStartsAt: timestamp('subscription_starts_at', { withTimezone: true }),
  subscriptionEndDate:  timestamp('subscription_end_date', { withTimezone: true }),
  maxUsers:             integer('max_users').notNull().default(5),         // user seat limit
  isActive:             boolean('is_active').notNull().default(true),
  // contact for support
  contactEmail:         text('contact_email'),
  contactPhone:         text('contact_phone'),
  contactHours:         text('contact_hours'),
  // settings
  defaultCurrency:      text('default_currency').default('SAR'),
  isVatRegistered:      boolean('is_vat_registered').notNull().default(false),
  vatRate:              integer('vat_rate').notNull().default(15),         // percent
  // SMTP email settings
  smtpHost:             text('smtp_host'),
  smtpPort:             integer('smtp_port'),
  smtpUser:             text('smtp_user'),
  smtpPassword:         text('smtp_password'),
  smtpFromName:         text('smtp_from_name'),
  smtpFromEmail:        text('smtp_from_email'),
  smtpEncryption:       text('smtp_encryption').default('tls'),
  defaultQuoteTerms:    text('default_quote_terms'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});

export type Agency    = typeof agencies.$inferSelect;
export type NewAgency = typeof agencies.$inferInsert;
