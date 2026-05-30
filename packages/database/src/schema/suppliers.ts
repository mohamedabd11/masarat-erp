/**
 * Suppliers & Operations — الموردون والعمليات
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { employeeStatusEnum } from './enums.js';
import { agencies } from './agencies.js';
import { users } from './users.js';

/**
 * الموردون — Suppliers
 */
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),

    // نوع المورد
    type: varchar('type', { length: 50 }).notNull().default('airline'),
    // airline | hotel | umrah_operator | insurance | transport | other

    vatNumber: varchar('vat_number', { length: 15 }),
    contactName: varchar('contact_name', { length: 200 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 20 }),

    // كود حساب المورد في دليل الحسابات
    payableAccountCode: varchar('payable_account_code', { length: 20 }),

    // الرصيد المستحق للمورد (بالهللات)
    balanceDueHalalas: bigint('balance_due_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),

    // شروط الدفع (بالأيام)
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),

    address: jsonb('address'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),

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
    suppliersAgencyIdIdx: index('suppliers_agency_id_idx').on(t.agencyId),
    suppliersTypeIdx: index('suppliers_type_idx').on(t.agencyId, t.type),
  })
);

/**
 * البنوك والصناديق — Bank Accounts
 */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),

    type: varchar('type', { length: 20 }).notNull().default('bank'),
    // bank | cash | pos

    bankName: varchar('bank_name', { length: 100 }),
    accountNumber: varchar('account_number', { length: 30 }),
    iban: varchar('iban', { length: 34 }),

    currency: varchar('currency', { length: 3 }).notNull().default('SAR'),

    // الرصيد الحالي (بالهللات)
    balanceHalalas: bigint('balance_halalas', { mode: 'bigint' })
      .notNull()
      .default(0n),

    // كود الحساب في دليل الحسابات
    accountCode: varchar('account_code', { length: 20 }).notNull(),

    isActive: boolean('is_active').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    baAgencyIdIdx: index('ba_agency_id_idx').on(t.agencyId),
    baTypeIdx: index('ba_type_idx').on(t.agencyId, t.type),
  })
);

/**
 * الموظفون — Employees
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    departmentId: uuid('department_id'), // references departments.id

    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    nationalId: varchar('national_id', { length: 20 }),
    mobile: varchar('mobile', { length: 20 }),
    email: varchar('email', { length: 255 }),

    jobTitle: varchar('job_title', { length: 100 }),
    role: varchar('role', { length: 50 }),

    // الراتب (بالهللات)
    salaryHalalas: bigint('salary_halalas', { mode: 'bigint' }),

    status: employeeStatusEnum('status').notNull().default('active'),

    hireDate: timestamp('hire_date', { withTimezone: true }),
    terminationDate: timestamp('termination_date', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    employeesAgencyIdIdx: index('employees_agency_id_idx').on(t.agencyId),
    employeesStatusIdx: index('employees_status_idx').on(t.agencyId, t.status),
    employeesDepartmentIdx: index('employees_department_idx').on(t.agencyId, t.departmentId),
  })
);

/**
 * الأقسام — Departments
 */
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    managerId: uuid('manager_id'),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    departmentsAgencyIdIdx: index('departments_agency_id_idx').on(t.agencyId),
  })
);

/**
 * أسعار الصرف — Exchange Rates
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    fromCurrency: varchar('from_currency', { length: 3 }).notNull(),
    toCurrency: varchar('to_currency', { length: 3 }).notNull(),

    // السعر كـ integer مضروب في 10000 (4 منازل عشرية)
    // مثال: 1 USD = 3.7500 SAR → يُخزَّن كـ 37500
    rateBps: integer('rate_bps').notNull(),

    effectiveDate: timestamp('effective_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    erAgencyIdIdx: index('er_agency_id_idx').on(t.agencyId),
    erCurrenciesIdx: index('er_currencies_idx').on(t.agencyId, t.fromCurrency, t.toCurrency),
    erEffectiveDateIdx: index('er_effective_date_idx').on(t.agencyId, t.effectiveDate),
  })
);
