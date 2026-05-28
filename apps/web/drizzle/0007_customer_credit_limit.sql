-- Migration 0007: Customer credit limits

ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit_halalas integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN customers.credit_limit_halalas IS '0 = no credit limit enforced; positive value = max outstanding AR allowed in halalas';
