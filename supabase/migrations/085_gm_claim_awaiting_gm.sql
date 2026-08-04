-- 085: GM Claims becomes the General Manager's single inbox.
--
-- A verified Payment Request now lands in gm_claims the moment the ministry
-- EXCO signs it off, rather than only after the GM approves. The GM accepts it
-- there — which is also the instruction to Finance to raise the PV — so the
-- separate Request Queue page is no longer needed.
--
-- gm_status tracks that hand-off:
--   AWAITING_GM  freshly verified by EXCO, shown highlighted, GM to accept
--   ACCEPTED     GM has instructed Finance; the PV can now be raised
--
-- Defaulting to ACCEPTED keeps every existing claim behaving exactly as before
-- — those were logged by the GM directly, so they need no acceptance step.

ALTER TABLE gm_claims
  ADD COLUMN IF NOT EXISTS gm_status TEXT NOT NULL DEFAULT 'ACCEPTED';

ALTER TABLE gm_claims DROP CONSTRAINT IF EXISTS gm_claims_gm_status_check;
ALTER TABLE gm_claims ADD CONSTRAINT gm_claims_gm_status_check
  CHECK (gm_status IN ('AWAITING_GM', 'ACCEPTED'));

-- The GM's inbox sorts on this, so index it.
CREATE INDEX IF NOT EXISTS idx_gm_claims_gm_status ON gm_claims(gm_status);
