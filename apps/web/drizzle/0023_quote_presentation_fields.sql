-- 0023 — Preserve all fields entered by the quotation screen.
--
-- The client captures bilingual customer details, separate subtotal/VAT totals,
-- issue date, and terms. The original SQL table kept only a single name/total,
-- so those values were silently lost. Runtime schema sync mirrors these
-- idempotent statements in apps/web/src/instrumentation.ts.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_name_en TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subtotal_halalas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vat_halalas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS issue_date TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS terms TEXT;
