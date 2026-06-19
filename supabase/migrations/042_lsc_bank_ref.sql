-- Add Luther Study Centre cashflow reference flag to bank accounts
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS is_lsc_cashflow_ref BOOLEAN NOT NULL DEFAULT false;
