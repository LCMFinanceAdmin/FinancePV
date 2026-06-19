-- Add Highlands Lakeview Enterprises cashflow reference flag to bank accounts
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS is_hle_cashflow_ref BOOLEAN NOT NULL DEFAULT false;
