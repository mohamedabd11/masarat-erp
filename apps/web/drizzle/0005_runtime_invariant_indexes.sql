CREATE UNIQUE INDEX IF NOT EXISTS "receipt_vouchers_reversal_uq" ON "receipt_vouchers" USING btree ("original_voucher_id") WHERE "receipt_vouchers"."original_voucher_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_converted_booking_uq" ON "quotes" USING btree ("converted_to_booking_id") WHERE "quotes"."converted_to_booking_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_fx_reval_uq" ON "journal_entries" USING btree ("agency_id","source_id","date") WHERE "journal_entries"."source" = 'fx_revaluation';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pnr_expiry" ON "pnr_records" USING btree ("status","expires_at") WHERE "pnr_records"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pnr_agency_created" ON "pnr_records" USING btree ("agency_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pnr_agency_status" ON "pnr_records" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_active_passenger_uq" ON "tickets" USING btree ("agency_id","pnr_id","passenger_name") WHERE "tickets"."status" IN ('active', 'pending');
