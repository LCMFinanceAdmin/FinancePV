-- Add workflow date tracking and monthly flag to gm_claims
ALTER TABLE gm_claims
  ADD COLUMN IF NOT EXISTS is_monthly            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finance_to_gm_at      DATE,
  ADD COLUMN IF NOT EXISTS finance_to_gm_na      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gm_verified_at        DATE,
  ADD COLUMN IF NOT EXISTS payment_made_at       DATE,
  ADD COLUMN IF NOT EXISTS claimant_informed_at  DATE;
