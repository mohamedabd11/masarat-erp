import { pgTable, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const agencies = pgTable('agencies', {
  id:                 text('id').primaryKey(),           // nanoid
  nameAr:             text('name_ar').notNull(),
  nameEn:             text('name_en'),
  email:              text('email'),
  phone:              text('phone'),
  addressAr:          text('address_ar'),
  addressEn:          text('address_en'),
  city:               text('city'),
  country:            text('country').default('SA'),
  vatNumber:          text('vat_number'),
  crNumber:           text('cr_number'),
  logoUrl:            text('logo_url'),
  // subscription
  plan:               text('plan').notNull().default('trial'),           // trial|starter|professional|lifetime
  subscriptionStatus: text('subscription_status').notNull().default('trial'), // trial|active|past_due|cancelled|lifetime
  trialEndDate:       timestamp('trial_end_date'),
  subscriptionEndDate:timestamp('subscription_end_date'),
  isActive:           boolean('is_active').notNull().default(true),
  // contact for support
  contactEmail:       text('contact_email'),
  contactPhone:       text('contact_phone'),
  contactHours:       text('contact_hours'),
  // settings
  defaultCurrency:    text('default_currency').default('SAR'),
  isVatRegistered:    boolean('is_vat_registered').notNull().default(false),
  vatRate:            integer('vat_rate').notNull().default(15),         // percent × 100 = basis points
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
});

export type Agency    = typeof agencies.$inferSelect;
export type NewAgency = typeof agencies.$inferInsert;
