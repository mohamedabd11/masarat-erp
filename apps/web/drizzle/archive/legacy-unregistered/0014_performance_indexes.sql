-- ════════════════════════════════════════════════════════════════════════════
-- 0014 — Performance indexes (FK columns + common WHERE/composite filters)
-- ════════════════════════════════════════════════════════════════════════════
-- All statements use IF NOT EXISTS so the migration is idempotent and safe to
-- re-run. These back the agency-scoped list/report/GL hot paths and the
-- foreign-key join columns that previously had no covering index.

-- ── BANK ACCOUNTS ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bank_accounts_agency        ON bank_accounts(agency_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_agency_active ON bank_accounts(agency_id, is_active);

-- ── BANK TRANSACTIONS ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bank_txn_agency_idx      ON bank_transactions(agency_id);
CREATE INDEX IF NOT EXISTS bank_txn_agency_date_idx ON bank_transactions(agency_id, date);
CREATE INDEX IF NOT EXISTS bank_txn_source_idx      ON bank_transactions(source_type, source_id);

-- ── CHEQUES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cheques_agency        ON cheques(agency_id);
CREATE INDEX IF NOT EXISTS idx_cheques_bank_account  ON cheques(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_cheques_agency_status ON cheques(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_cheques_agency_due    ON cheques(agency_id, due_date);

-- ── INVOICES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_customer        ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking         ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_agency_deferred ON invoices(agency_id, deferred_until);

-- ── CHART OF ACCOUNTS ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coa_agency ON chart_of_accounts(agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coa_agency_code ON chart_of_accounts(agency_id, code);

-- ── JOURNAL ENTRIES ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_source_id ON journal_entries(agency_id, source_id);

-- ── EXCHANGE RATES ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exchange_rates_agency ON exchange_rates(agency_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON exchange_rates(agency_id, from_currency, to_currency, effective_date);

-- ── COST CENTERS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cost_centers_agency ON cost_centers(agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_agency_code_uq ON cost_centers(agency_id, code);

-- ── PAYMENTS ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_invoice     ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer    ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_agency_date ON payments(agency_id, date);

-- ── RECEIPT VOUCHERS ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_agency      ON receipt_vouchers(agency_id);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_customer    ON receipt_vouchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_booking     ON receipt_vouchers(booking_id);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_invoice     ON receipt_vouchers(invoice_id);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_agency_date ON receipt_vouchers(agency_id, date);

-- ── SUPPLIER PAYMENTS ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_payments_agency        ON supplier_payments(agency_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier      ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_booking       ON supplier_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_agency_status ON supplier_payments(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_agency_date   ON supplier_payments(agency_id, date);
