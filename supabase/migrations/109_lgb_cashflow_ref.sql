-- 109: Lutheran Garden Berhad gets its own cashflow reference.
--
-- LGB vouchers are numbered in their own series and paid from Hong Leong, but
-- the cashflow view groups by pv_type and had no LGB group — so an LGB payment
-- would have been counted against the LCM reference account, understating what
-- LCM has and hiding what LGB owes. A separate company's payments belong to a
-- separate balance.
--
-- The pattern matches is_lcm/bam/lsc/hle_cashflow_ref exactly: a flag naming
-- which account the cashflow calculator reads for that entity.

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS is_lgb_cashflow_ref BOOLEAN NOT NULL DEFAULT false;

-- The Lutheran Garden account at Hong Leong, if it is still the one in use.
-- Only set it when nothing has been chosen yet, so a deliberate choice made on
-- the Banking page is never overwritten by re-running this.
UPDATE bank_accounts
   SET is_lgb_cashflow_ref = true
 WHERE account_type = 'CURRENT'
   AND is_active
   AND entity = 'LUTHERAN_GARDEN'
   AND bank_name ILIKE '%hong leong%'
   AND NOT EXISTS (SELECT 1 FROM bank_accounts b2 WHERE b2.is_lgb_cashflow_ref);

COMMENT ON COLUMN bank_accounts.is_lgb_cashflow_ref IS
  'The account the cashflow view reads for Lutheran Garden Berhad vouchers';
