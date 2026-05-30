-- Migration 0005: Bank reconciliation columns

-- Add reconciliation tracking to bank_accounts
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS reconciled_at              timestamp;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS reconciled_balance_halalas integer;

-- Add reconciliation tracking to bank_transactions
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS is_reconciled  boolean NOT NULL DEFAULT false;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS reconciled_at  timestamp;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS reconciled_by  text;

-- Indexes for faster reconciliation queries
CREATE INDEX IF NOT EXISTS bank_txn_account_date_idx    ON bank_transactions(bank_account_id, date);
CREATE INDEX IF NOT EXISTS bank_txn_reconciled_idx      ON bank_transactions(bank_account_id, is_reconciled);
