-- Add claimant bank details to gm_claims
ALTER TABLE gm_claims
  ADD COLUMN IF NOT EXISTS payee_bank      TEXT,
  ADD COLUMN IF NOT EXISTS payee_bank_acct TEXT;
