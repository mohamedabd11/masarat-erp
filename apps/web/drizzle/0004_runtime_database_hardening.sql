-- Runtime database invariants that Drizzle's schema snapshot cannot express.
-- Keep every block idempotent so a schema-only copy of an existing database can
-- be reconciled safely after its migration history has been baselined.

-- Existing bookings predate booking_lines. Preserve their aggregate amounts as
-- explicitly marked legacy rows; newer per-line reports can exclude them.
INSERT INTO booking_lines (
  id, booking_id, agency_id, service_type, description,
  unit_cost_halalas, total_cost_halalas,
  unit_price_excl_vat_halalas, total_price_excl_vat_halalas,
  vat_category, vat_rate_bps, vat_halalas,
  revenue_model, is_legacy, status, sort_order,
  created_at, updated_at
)
SELECT
  'legacy-' || b.id,
  b.id,
  b.agency_id,
  COALESCE(b.service_type, 'custom'),
  COALESCE(b.service_type, 'custom'),
  COALESCE(b.cost_price_halalas, 0),
  COALESCE(b.cost_price_halalas, 0),
  COALESCE(b.total_price_halalas, 0),
  COALESCE(b.total_price_halalas, 0),
  'S', 0, 0,
  COALESCE(b.details->>'revenueModel', 'agent'),
  TRUE,
  CASE WHEN b.status = 'cancelled' THEN 'cancelled' ELSE 'active' END,
  1,
  b.created_at,
  b.updated_at
FROM bookings b
WHERE NOT EXISTS (
  SELECT 1 FROM booking_lines bl WHERE bl.booking_id = b.id
);
--> statement-breakpoint

-- These relations are deferred because the application creates the operational
-- row before its journal row inside the same transaction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_original_invoice') THEN
    ALTER TABLE invoices DROP CONSTRAINT fk_invoices_original_invoice;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_journal_entry') THEN
    ALTER TABLE invoices DROP CONSTRAINT fk_invoices_journal_entry;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_journal_entry') THEN
    ALTER TABLE payments DROP CONSTRAINT fk_payments_journal_entry;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookings_journal_entry') THEN
    ALTER TABLE bookings DROP CONSTRAINT fk_bookings_journal_entry;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_payments_supplier') THEN
    ALTER TABLE supplier_payments DROP CONSTRAINT fk_supplier_payments_supplier;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_payments_journal') THEN
    ALTER TABLE supplier_payments DROP CONSTRAINT fk_supplier_payments_journal;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipt_vouchers_journal') THEN
    ALTER TABLE receipt_vouchers DROP CONSTRAINT fk_receipt_vouchers_journal;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotes_converted_booking') THEN
    ALTER TABLE quotes DROP CONSTRAINT fk_quotes_converted_booking;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_original_invoice_deferred') THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_original_invoice_deferred
      FOREIGN KEY (original_invoice_id) REFERENCES invoices(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_journal_entry_deferred') THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_journal_entry_deferred
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_journal_entry_deferred') THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_journal_entry_deferred
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookings_journal_entry_deferred') THEN
    ALTER TABLE bookings ADD CONSTRAINT fk_bookings_journal_entry_deferred
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_payments_supplier_deferred') THEN
    ALTER TABLE supplier_payments ADD CONSTRAINT fk_supplier_payments_supplier_deferred
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_payments_journal_deferred') THEN
    ALTER TABLE supplier_payments ADD CONSTRAINT fk_supplier_payments_journal_deferred
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipt_vouchers_journal_deferred') THEN
    ALTER TABLE receipt_vouchers ADD CONSTRAINT fk_receipt_vouchers_journal_deferred
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotes_converted_booking_deferred') THEN
    ALTER TABLE quotes ADD CONSTRAINT fk_quotes_converted_booking_deferred
      FOREIGN KEY (converted_to_booking_id) REFERENCES bookings(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
--> statement-breakpoint

-- Journal lines must represent non-negative debit/credit sides. NOT VALID keeps
-- legacy rows reviewable while enforcing the rule for every new write.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_nonneg_chk') THEN
    ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_nonneg_chk
      CHECK (debit_halalas >= 0 AND credit_halalas >= 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint

-- Apply fail-open tenant isolation to every tenant-owned table. With no tenant
-- context, scheduled/admin work remains unchanged; with a context, access is
-- limited to that agency. FORCE is required because the app user owns tables.
DO $rls$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'agency_id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name <> 'idempotency_keys'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS bypass_for_service_role ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS agency_isolation ON public.%I', t);
    EXECUTE format($policy$
      CREATE POLICY agency_isolation ON public.%I AS PERMISSIVE FOR ALL
      USING (
        current_setting('app.current_agency_id', true) IS NULL
        OR current_setting('app.current_agency_id', true) = ''
        OR agency_id = current_setting('app.current_agency_id', true)
      )
    $policy$, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$rls$;
--> statement-breakpoint

-- Posted financial records are immutable. Corrections must be expressed through
-- reversing entries or credit notes; maintenance jobs have an explicit bypass.
CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation()
RETURNS TRIGGER AS $function$
BEGIN
  IF coalesce(current_setting('app.allow_financial_purge', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF OLD.is_posted THEN
    RAISE EXCEPTION 'Cannot % a posted journal entry (%). Create a reversing entry instead.', lower(TG_OP), OLD.id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS enforce_journal_immutability ON journal_entries;
--> statement-breakpoint
CREATE TRIGGER enforce_journal_immutability
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_issued_invoice_deletion()
RETURNS TRIGGER AS $function$
BEGIN
  IF coalesce(current_setting('app.allow_financial_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Cannot delete a % invoice (%). Issue a credit note instead.', OLD.status, OLD.id;
  END IF;
  RETURN OLD;
END;
$function$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS enforce_invoice_immutability ON invoices;
--> statement-breakpoint
CREATE TRIGGER enforce_invoice_immutability
BEFORE DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION prevent_issued_invoice_deletion();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_payment_deletion()
RETURNS TRIGGER AS $function$
BEGIN
  IF coalesce(current_setting('app.allow_financial_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Payments are append-only and cannot be deleted (%). Record a refund/reversal instead.', OLD.id;
END;
$function$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS enforce_payment_immutability ON payments;
--> statement-breakpoint
CREATE TRIGGER enforce_payment_immutability
BEFORE DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION prevent_payment_deletion();
