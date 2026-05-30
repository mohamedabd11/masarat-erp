CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"email" text,
	"phone" text,
	"address_ar" text,
	"address_en" text,
	"city" text,
	"country" text DEFAULT 'SA',
	"vat_number" text,
	"cr_number" text,
	"logo_url" text,
	"plan" text DEFAULT 'trial' NOT NULL,
	"subscription_status" text DEFAULT 'trial' NOT NULL,
	"trial_end_date" timestamp,
	"subscription_end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"contact_hours" text,
	"default_currency" text DEFAULT 'SAR',
	"is_vat_registered" boolean DEFAULT false NOT NULL,
	"vat_rate" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"email" text NOT NULL,
	"name_ar" text,
	"name_en" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"phone" text,
	"email" text,
	"passport_number" text,
	"national_id" text,
	"nationality" text,
	"date_of_birth" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"type" text,
	"phone" text,
	"email" text,
	"account_number" text,
	"vat_number" text,
	"balance_halalas" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"icon" text DEFAULT 'layers' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_number" text NOT NULL,
	"service_type" text NOT NULL,
	"custom_type_id" text,
	"custom_type_name" text,
	"customer_id" text,
	"customer_name_ar" text,
	"customer_name_en" text,
	"customer_phone" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"total_price_halalas" integer DEFAULT 0 NOT NULL,
	"cost_price_halalas" integer DEFAULT 0 NOT NULL,
	"profit_halalas" integer DEFAULT 0 NOT NULL,
	"paid_halalas" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"notes" text,
	"details" jsonb,
	"journal_entry_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"type" text DEFAULT '380' NOT NULL,
	"booking_id" text,
	"customer_id" text,
	"seller_name_ar" text,
	"seller_name_en" text,
	"seller_vat_number" text,
	"seller_cr_number" text,
	"seller_address" text,
	"buyer_name_ar" text,
	"buyer_name_en" text,
	"buyer_phone" text,
	"buyer_email" text,
	"buyer_national_id" text,
	"subtotal_halalas" integer DEFAULT 0 NOT NULL,
	"vat_halalas" integer DEFAULT 0 NOT NULL,
	"total_halalas" integer DEFAULT 0 NOT NULL,
	"paid_halalas" integer DEFAULT 0 NOT NULL,
	"issue_date" text NOT NULL,
	"supply_date" text,
	"due_date" text,
	"status" text DEFAULT 'issued' NOT NULL,
	"payment_method" text,
	"payment_ref" text,
	"zatca_uuid" text,
	"zatca_hash" text,
	"is_e_invoice" boolean DEFAULT false NOT NULL,
	"items" jsonb,
	"notes" text,
	"journal_entry_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"invoice_id" text,
	"booking_id" text,
	"customer_id" text,
	"customer_name" text,
	"amount_halalas" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"voucher_number" text,
	"date" text NOT NULL,
	"notes" text,
	"journal_entry_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"voucher_number" text NOT NULL,
	"customer_id" text,
	"customer_name" text,
	"amount_halalas" integer NOT NULL,
	"method" text NOT NULL,
	"description" text,
	"booking_id" text,
	"invoice_id" text,
	"date" text NOT NULL,
	"journal_entry_id" text,
	"is_refund" text DEFAULT 'false',
	"original_voucher_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_id" text,
	"supplier_id" text,
	"supplier_name" text,
	"payee_name" text,
	"amount_halalas" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"voucher_number" text,
	"expense_category" text,
	"booking_number" text,
	"date" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"is_refund" text DEFAULT 'false',
	"original_payment_id" text,
	"journal_entry_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" text,
	"customer_name" text,
	"customer_phone" text,
	"items" jsonb,
	"total_halalas" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"valid_until" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"type" text NOT NULL,
	"sub_type" text,
	"parent_id" text,
	"level" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"allow_direct_entry" boolean DEFAULT true NOT NULL,
	"opening_balance_halalas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text DEFAULT 'SAR' NOT NULL,
	"rate" integer NOT NULL,
	"effective_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"entry_number" text NOT NULL,
	"date" text NOT NULL,
	"description_ar" text,
	"description_en" text,
	"reference" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"is_posted" boolean DEFAULT true NOT NULL,
	"total_debit_halalas" integer DEFAULT 0 NOT NULL,
	"total_credit_halalas" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"agency_id" text NOT NULL,
	"account_code" text NOT NULL,
	"account_name_ar" text,
	"account_name_en" text,
	"debit_halalas" integer DEFAULT 0 NOT NULL,
	"credit_halalas" integer DEFAULT 0 NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"type" text NOT NULL,
	"account_number" text,
	"bank_name" text,
	"iban" text,
	"opening_balance_halalas" integer DEFAULT 0 NOT NULL,
	"current_balance_halalas" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"gl_account_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_reconciled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"bank_account_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_halalas" integer NOT NULL,
	"balance_after_halalas" integer,
	"description" text,
	"reference" text,
	"source_type" text,
	"source_id" text,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"cheque_number" text NOT NULL,
	"bank_name" text,
	"amount_halalas" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issue_date" text,
	"due_date" text,
	"payer_name" text,
	"payee_name" text,
	"related_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_number" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"department" text,
	"position" text,
	"hire_date" text,
	"end_date" text,
	"salary_halalas" integer DEFAULT 0 NOT NULL,
	"phone" text,
	"email" text,
	"national_id" text,
	"iqama_number" text,
	"bank_account_number" text,
	"bank_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"gl_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"days" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"amount_halalas" integer NOT NULL,
	"month" text NOT NULL,
	"payment_method" text,
	"notes" text,
	"journal_entry_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_counters" (
	"agency_id" text NOT NULL,
	"counter_type" text NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agency_counters_agency_id_counter_type_pk" PRIMARY KEY("agency_id","counter_type")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_counters" ADD CONSTRAINT "agency_counters_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;