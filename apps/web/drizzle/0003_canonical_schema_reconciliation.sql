-- Canonical schema reconciliation.
--
-- Migrations 0003-0022 that pre-date this file were never registered in
-- drizzle/meta/_journal.json and therefore were never part of the executable
-- migration chain. This generated migration intentionally supersedes their
-- schema changes in one auditable step, starting from the registered 0000-0002
-- baseline. Runtime-only hardening is applied by the following migration.

CREATE TABLE "booking_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"agency_id" text NOT NULL,
	"service_type" text NOT NULL,
	"description" text NOT NULL,
	"supplier_id" text,
	"supplier_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cost_halalas" bigint DEFAULT 0 NOT NULL,
	"total_cost_halalas" bigint DEFAULT 0 NOT NULL,
	"unit_price_excl_vat_halalas" bigint DEFAULT 0 NOT NULL,
	"total_price_excl_vat_halalas" bigint DEFAULT 0 NOT NULL,
	"vat_category" text DEFAULT 'S' NOT NULL,
	"vat_rate_bps" integer DEFAULT 1500 NOT NULL,
	"vat_halalas" bigint DEFAULT 0 NOT NULL,
	"revenue_model" text DEFAULT 'agent' NOT NULL,
	"revenue_account_code" text,
	"cost_account_code" text,
	"operational_status" text DEFAULT 'pending' NOT NULL,
	"pnr_reference" text,
	"voucher_number" text,
	"is_legacy" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp,
	"refund_halalas" bigint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"locked_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"type" text DEFAULT 'department' NOT NULL,
	"parent_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"shift_id" text,
	"date" text NOT NULL,
	"check_in" timestamp,
	"check_out" timestamp,
	"status" text DEFAULT 'present' NOT NULL,
	"work_minutes" integer DEFAULT 0,
	"overtime_minutes" integer DEFAULT 0,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"contract_number" text NOT NULL,
	"type" text DEFAULT 'full_time' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"base_salary_halalas" bigint DEFAULT 0 NOT NULL,
	"housing_allowance_halalas" bigint DEFAULT 0 NOT NULL,
	"transport_allowance_halalas" bigint DEFAULT 0 NOT NULL,
	"other_allowances_halalas" bigint DEFAULT 0 NOT NULL,
	"salary_components" jsonb,
	"working_days_per_week" integer DEFAULT 5 NOT NULL,
	"working_hours_per_day" integer DEFAULT 8 NOT NULL,
	"annual_leave_days" integer DEFAULT 21 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eosb_accruals" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"month" text NOT NULL,
	"amount_halalas" bigint DEFAULT 0 NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"journal_entry_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "eosb_accruals_agency_month_uq" UNIQUE("agency_id","month")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"year" integer NOT NULL,
	"annual_entitled" integer DEFAULT 21 NOT NULL,
	"annual_used" integer DEFAULT 0 NOT NULL,
	"sick_entitled" integer DEFAULT 30 NOT NULL,
	"sick_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_balance_emp_year_uq" UNIQUE("employee_id","year")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"salary_payment_id" text,
	"month" text NOT NULL,
	"base_salary_halalas" bigint DEFAULT 0 NOT NULL,
	"housing_allowance_halalas" bigint DEFAULT 0 NOT NULL,
	"transport_allowance_halalas" bigint DEFAULT 0 NOT NULL,
	"other_allowances_halalas" bigint DEFAULT 0 NOT NULL,
	"gross_halalas" bigint DEFAULT 0 NOT NULL,
	"deductions_halalas" bigint DEFAULT 0 NOT NULL,
	"advance_deduction_halalas" bigint DEFAULT 0 NOT NULL,
	"gosi_employee_halalas" bigint DEFAULT 0 NOT NULL,
	"gosi_employer_halalas" bigint DEFAULT 0 NOT NULL,
	"net_halalas" bigint DEFAULT 0 NOT NULL,
	"components" jsonb,
	"payment_date" text,
	"payment_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payslips_agency_emp_month_uq" UNIQUE("agency_id","employee_id","month")
);
--> statement-breakpoint
CREATE TABLE "salary_advances" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"amount_halalas" bigint NOT NULL,
	"request_date" text NOT NULL,
	"deduct_from" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"approved_by" text,
	"journal_entry_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"days_of_week" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pnr_records" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"pnr_code" text NOT NULL,
	"gds" text,
	"airline" text,
	"flight_numbers" text,
	"origin" text,
	"destination" text,
	"departure_date" text,
	"return_date" text,
	"passenger_count" integer DEFAULT 1 NOT NULL,
	"passenger_names" text,
	"ticket_numbers" text,
	"segments" jsonb,
	"passengers" jsonb,
	"fare_halalas" bigint DEFAULT 0 NOT NULL,
	"tax_halalas" bigint DEFAULT 0 NOT NULL,
	"total_halalas" bigint DEFAULT 0 NOT NULL,
	"booking_id" text,
	"customer_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sync_status" text,
	"notes" text,
	"expires_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"event_type" text NOT NULL,
	"provider" text,
	"resource_id" text,
	"resource_type" text,
	"actor_id" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"provider_code" text NOT NULL,
	"label" text,
	"credentials" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"tested_at" timestamp with time zone,
	"test_status" text,
	"test_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"segment_index" integer NOT NULL,
	"coupon_status" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"pnr_id" text NOT NULL,
	"booking_id" text,
	"customer_id" text,
	"credential_id" text,
	"issuing_provider" text,
	"ticket_number" text,
	"passenger_name" text NOT NULL,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"fare_halalas" bigint DEFAULT 0 NOT NULL,
	"tax_halalas" bigint DEFAULT 0 NOT NULL,
	"total_halalas" bigint DEFAULT 0 NOT NULL,
	"issued_by" text,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"refunded_at" timestamp with time zone,
	"reconciliation_attempts" integer DEFAULT 0 NOT NULL,
	"last_reconciliation_at" timestamp with time zone,
	"pending_operation_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"customer_id" text,
	"customer_name" text,
	"assigned_to" text,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'meeting' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"location" text,
	"notes" text,
	"outcome" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"customer_id" text,
	"title" text NOT NULL,
	"subtotal_halalas" bigint DEFAULT 0 NOT NULL,
	"vat_halalas" bigint DEFAULT 0 NOT NULL,
	"total_halalas" bigint DEFAULT 0 NOT NULL,
	"items" jsonb,
	"notes" text,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"day_of_month" integer,
	"start_date" text NOT NULL,
	"end_date" text,
	"last_issued_at" text,
	"next_issue_at" text NOT NULL,
	"total_issued" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"buyer_name_ar" text,
	"payment_method" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_features" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"override_type" text NOT NULL,
	"enabled_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agency_features_agency_key_uq" UNIQUE("agency_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "bsp_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"type" text NOT NULL,
	"reference_number" text NOT NULL,
	"issue_date" text NOT NULL,
	"due_date" text,
	"amount_halalas" bigint NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"reason" text NOT NULL,
	"airline_code" text,
	"ticket_numbers" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"bsp_billing_id" text,
	"journal_entry_id" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bsp_billings" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"billing_period" text NOT NULL,
	"period_type" text DEFAULT 'monthly' NOT NULL,
	"total_sales_halalas" bigint DEFAULT 0 NOT NULL,
	"total_refunds_halalas" bigint DEFAULT 0 NOT NULL,
	"total_commission_halalas" bigint DEFAULT 0 NOT NULL,
	"net_remit_halalas" bigint NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_date" text,
	"bank_account_id" text,
	"journal_entry_id" text,
	"reference" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_passengers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"type" text DEFAULT 'ADT' NOT NULL,
	"gender" text,
	"passport_number" text,
	"passport_expiry" text,
	"nationality" text,
	"date_of_birth" text,
	"national_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "customer_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_id" text,
	"recipient_name" text NOT NULL,
	"recipient_phone" text,
	"channel" text NOT NULL,
	"template_key" text,
	"message_ar" text NOT NULL,
	"message_en" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plan_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" text NOT NULL,
	"amount_halalas" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"total_amount_halalas" bigint NOT NULL,
	"num_installments" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_trip_members" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"group_trip_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"phone" text,
	"passport_number" text,
	"passport_expiry" text,
	"nationality" text,
	"visa_status" text DEFAULT 'pending' NOT NULL,
	"visa_number" text,
	"visa_expiry" text,
	"room_type" text,
	"notes" text,
	"status" text DEFAULT 'registered' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_trips" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"service_type" text DEFAULT 'umrah' NOT NULL,
	"departure_date" text,
	"return_date" text,
	"capacity" integer,
	"price_per_person_halalas" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"reference_id" text,
	"error_message" text,
	"duration_ms" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "trial_end_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "subscription_end_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "balance_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "total_price_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "cost_price_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "profit_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "paid_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subtotal_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "vat_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "paid_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "receipt_vouchers" ALTER COLUMN "amount_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "supplier_payments" ALTER COLUMN "amount_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "total_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ALTER COLUMN "opening_balance_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "total_debit_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "total_credit_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_lines" ALTER COLUMN "debit_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "journal_lines" ALTER COLUMN "credit_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "opening_balance_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "current_balance_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bank_transactions" ALTER COLUMN "amount_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "bank_transactions" ALTER COLUMN "balance_after_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "cheques" ALTER COLUMN "amount_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "salary_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "salary_payments" ALTER COLUMN "amount_halalas" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "agency_counters" ALTER COLUMN "current_value" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "trial_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "subscription_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "max_users" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "enabled_modules" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_host" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_port" integer;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_user" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_password" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_from_name" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_from_email" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "smtp_encryption" text DEFAULT 'tls';--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "default_quote_terms" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "gosi_employer_rate_saudi" integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "gosi_employee_rate_saudi" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "gosi_employer_rate_expat" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_environment" text DEFAULT 'simulation' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_onboarding_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_compliance_request_id" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_compliance_csid" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_compliance_secret" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_production_csid" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_production_secret" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_private_key" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_certificate_pem" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_certificate_expiry" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_last_invoice_hash" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_error_message" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "zatca_invoice_counter" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "permissions" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "credit_limit_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opening_balance_halalas" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_types" ADD COLUMN "revenue_mode" text DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_types" ADD COLUMN "vat_rate" integer;--> statement-breakpoint
ALTER TABLE "service_types" ADD COLUMN "is_taxable" boolean;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_vat_number" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_status" text DEFAULT 'not_submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_icv" bigint;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_pih" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_qr" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_signed_xml" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zatca_response" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_invoice_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deferred_until" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "revenue_recognized_at" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "service_type" text;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "fx_balance_minor" bigint;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "reconciled_balance_halalas" bigint;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "fx_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "fx_rate" integer;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "is_reconciled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "reconciled_by" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "nationality_type" text DEFAULT 'saudi' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eosb_accruals" ADD CONSTRAINT "eosb_accruals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pnr_records" ADD CONSTRAINT "pnr_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pnr_records" ADD CONSTRAINT "pnr_records_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pnr_records" ADD CONSTRAINT "pnr_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_events" ADD CONSTRAINT "travel_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_coupons" ADD CONSTRAINT "ticket_coupons_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pnr_id_pnr_records_id_fk" FOREIGN KEY ("pnr_id") REFERENCES "public"."pnr_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_to_employees_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_features" ADD CONSTRAINT "agency_features_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsp_adjustments" ADD CONSTRAINT "bsp_adjustments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsp_adjustments" ADD CONSTRAINT "bsp_adjustments_bsp_billing_id_bsp_billings_id_fk" FOREIGN KEY ("bsp_billing_id") REFERENCES "public"."bsp_billings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bsp_billings" ADD CONSTRAINT "bsp_billings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_log" ADD CONSTRAINT "provider_sync_log_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bl_booking" ON "booking_lines" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_bl_agency" ON "booking_lines" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_bl_agency_service" ON "booking_lines" USING btree ("agency_id","service_type");--> statement-breakpoint
CREATE INDEX "idx_bl_status" ON "booking_lines" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_periods_agency_ym_uq" ON "accounting_periods" USING btree ("agency_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "idx_cost_centers_agency" ON "cost_centers" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_agency_code_uq" ON "cost_centers" USING btree ("agency_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employee_date_uq" ON "attendance_records" USING btree ("employee_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "pnr_agency_code_uq" ON "pnr_records" USING btree ("agency_id","pnr_code");--> statement-breakpoint
CREATE INDEX "travel_events_agency_idx" ON "travel_events" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "travel_events_type_idx" ON "travel_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "travel_events_provider_idx" ON "travel_events" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "travel_events_resource_idx" ON "travel_events" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_creds_agency_provider_uq" ON "provider_credentials" USING btree ("agency_id","provider_code");--> statement-breakpoint
CREATE INDEX "coupons_ticket_idx" ON "ticket_coupons" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_agency_idx" ON "tickets" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "tickets_pnr_idx" ON "tickets" USING btree ("pnr_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_uq" ON "tickets" USING btree ("agency_id","ticket_number");--> statement-breakpoint
CREATE INDEX "idx_bp_agency_booking" ON "booking_passengers" USING btree ("agency_id","booking_id");--> statement-breakpoint
CREATE INDEX "idx_bp_passport" ON "booking_passengers" USING btree ("agency_id","passport_number");--> statement-breakpoint
CREATE INDEX "idx_cm_agency_booking" ON "customer_messages" USING btree ("agency_id","booking_id");--> statement-breakpoint
CREATE INDEX "idx_cm_agency_time" ON "customer_messages" USING btree ("agency_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_ppi_plan" ON "payment_plan_installments" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_ppi_agency" ON "payment_plan_installments" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "idx_ppi_due" ON "payment_plan_installments" USING btree ("agency_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_pp_agency" ON "payment_plans" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_pp_booking" ON "payment_plans" USING btree ("agency_id","booking_id");--> statement-breakpoint
CREATE INDEX "idx_gtm_group" ON "group_trip_members" USING btree ("group_trip_id");--> statement-breakpoint
CREATE INDEX "idx_gtm_agency" ON "group_trip_members" USING btree ("agency_id","group_trip_id");--> statement-breakpoint
CREATE INDEX "idx_gt_agency" ON "group_trips" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_gt_agency_status" ON "group_trips" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "idx_docs_entity" ON "documents" USING btree ("agency_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_docs_agency_time" ON "documents" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_psl_agency_time" ON "provider_sync_log" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_psl_agency_provider" ON "provider_sync_log" USING btree ("agency_id","provider","operation");--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" DROP CONSTRAINT IF EXISTS "cheques_bank_account_id_fkey";--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_customers_agency" ON "customers" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_agency" ON "suppliers" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_agency" ON "bookings" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_agency_status" ON "bookings" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "idx_invoices_agency" ON "invoices" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_agency_status" ON "invoices" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "idx_invoices_agency_created" ON "invoices" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_customer" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_booking" ON "invoices" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_agency_deferred" ON "invoices" USING btree ("agency_id","deferred_until");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_per_booking" ON "invoices" USING btree ("agency_id","booking_id") WHERE type IN ('380','388') AND booking_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_agency_number_uq" ON "invoices" USING btree ("agency_id","invoice_number");--> statement-breakpoint
CREATE INDEX "idx_payments_agency" ON "payments" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_payments_booking" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_payments_invoice" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payments_customer" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_payments_agency_date" ON "payments" USING btree ("agency_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_agency_voucher_uq" ON "payments" USING btree ("agency_id","voucher_number");--> statement-breakpoint
CREATE INDEX "idx_receipt_vouchers_agency" ON "receipt_vouchers" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_receipt_vouchers_customer" ON "receipt_vouchers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_receipt_vouchers_booking" ON "receipt_vouchers" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_receipt_vouchers_invoice" ON "receipt_vouchers" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_receipt_vouchers_agency_date" ON "receipt_vouchers" USING btree ("agency_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_vouchers_agency_voucher_uq" ON "receipt_vouchers" USING btree ("agency_id","voucher_number");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_agency" ON "supplier_payments" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_supplier" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_booking" ON "supplier_payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_agency_status" ON "supplier_payments" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_agency_date" ON "supplier_payments" USING btree ("agency_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payments_agency_voucher_uq" ON "supplier_payments" USING btree ("agency_id","voucher_number");--> statement-breakpoint
CREATE INDEX "idx_coa_agency" ON "chart_of_accounts" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_coa_agency_code" ON "chart_of_accounts" USING btree ("agency_id","code");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_agency" ON "exchange_rates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_lookup" ON "exchange_rates" USING btree ("agency_id","from_currency","to_currency","effective_date");--> statement-breakpoint
CREATE INDEX "idx_je_agency" ON "journal_entries" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_je_agency_date" ON "journal_entries" USING btree ("agency_id","date");--> statement-breakpoint
CREATE INDEX "idx_je_agency_source" ON "journal_entries" USING btree ("agency_id","source");--> statement-breakpoint
CREATE INDEX "idx_je_source_id" ON "journal_entries" USING btree ("agency_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_agency_number_uq" ON "journal_entries" USING btree ("agency_id","entry_number");--> statement-breakpoint
CREATE INDEX "idx_jl_agency" ON "journal_lines" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_jl_agency_account" ON "journal_lines" USING btree ("agency_id","account_code");--> statement-breakpoint
CREATE INDEX "idx_jl_entry" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_bank_accounts_agency" ON "bank_accounts" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_bank_accounts_agency_active" ON "bank_accounts" USING btree ("agency_id","is_active");--> statement-breakpoint
CREATE INDEX "bank_txn_account_date_idx" ON "bank_transactions" USING btree ("bank_account_id","date");--> statement-breakpoint
CREATE INDEX "bank_txn_reconciled_idx" ON "bank_transactions" USING btree ("bank_account_id","is_reconciled");--> statement-breakpoint
CREATE INDEX "bank_txn_agency_idx" ON "bank_transactions" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "bank_txn_agency_date_idx" ON "bank_transactions" USING btree ("agency_id","date");--> statement-breakpoint
CREATE INDEX "bank_txn_source_idx" ON "bank_transactions" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_cheques_agency" ON "cheques" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "idx_cheques_bank_account" ON "cheques" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "idx_cheques_agency_status" ON "cheques" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "idx_cheques_agency_due" ON "cheques" USING btree ("agency_id","due_date");--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_agency_emp_month_uq" UNIQUE("agency_id","employee_id","month");
