import { pgTable, text, boolean, timestamp, integer, bigint } from 'drizzle-orm/pg-core';

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
  // GOSI rates stored as basis points × 100 (e.g. 1200 = 12.00%).
  // Saudi 2024 reform: employer Saudi 12% (9%+2%+1%), employee Saudi 10% (9%+1%), employer expat 2%.
  gosiEmployerRateSaudi: integer('gosi_employer_rate_saudi').notNull().default(1200),
  gosiEmployeeRateSaudi: integer('gosi_employee_rate_saudi').notNull().default(1000),
  gosiEmployerRateExpat:  integer('gosi_employer_rate_expat').notNull().default(200),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
  // ZATCA Phase 2
  zatcaEnvironment:           text('zatca_environment').notNull().default('simulation'),
  zatcaOnboardingStatus:      text('zatca_onboarding_status').notNull().default('not_started'),
  zatcaComplianceRequestId:   text('zatca_compliance_request_id'),
  zatcaComplianceCsid:        text('zatca_compliance_csid'),         // encrypted
  zatcaComplianceSecret:      text('zatca_compliance_secret'),       // encrypted
  zatcaProductionCsid:        text('zatca_production_csid'),         // encrypted
  zatcaProductionSecret:      text('zatca_production_secret'),       // encrypted
  zatcaPrivateKey:             text('zatca_private_key'),             // encrypted
  zatcaCertificatePem:        text('zatca_certificate_pem'),
  zatcaCertificateExpiry:     timestamp('zatca_certificate_expiry', { withTimezone: true }),
  zatcaLastInvoiceHash:       text('zatca_last_invoice_hash'),
  zatcaOnboardedAt:           timestamp('zatca_onboarded_at', { withTimezone: true }),
  zatcaErrorMessage:          text('zatca_error_message'),
  // ICV — monotonically increasing per agency (never resets, unlike yearly invoice numbers)
  zatcaInvoiceCounter:        bigint('zatca_invoice_counter', { mode: 'number' }).notNull().default(0),
});

export type Agency    = typeof agencies.$inferSelect;
export type NewAgency = typeof agencies.$inferInsert;
