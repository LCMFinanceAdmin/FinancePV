-- 098: Record when a recurring voucher was actually raised.
--
-- The Last Created column showed `last_run`, which holds the voucher's *period*
-- date — 30 Jun for a July payment — because that is the date printed on the
-- voucher's face and the date the schedule works from. Useful, but it is not
-- when anybody created anything, so the column read as wrong.
--
-- The two facts are genuinely different and both matter, so they get their own
-- columns: last_run stays the period date that drives the schedule, and this
-- records the moment of submission.

ALTER TABLE recurring_pvs
  ADD COLUMN IF NOT EXISTS last_created_at TIMESTAMPTZ;

COMMENT ON COLUMN recurring_pvs.last_run IS
  'Voucher date of the last run — the period being paid for, not when it was raised';
COMMENT ON COLUMN recurring_pvs.last_created_at IS
  'When the last voucher was actually submitted';

-- Existing rows: recurring_runs already recorded the moment each voucher was
-- created, so backfill from there rather than leaving the column blank.
UPDATE recurring_pvs rp
   SET last_created_at = latest.created_at
  FROM (
    SELECT DISTINCT ON (recurring_id) recurring_id, created_at
      FROM recurring_runs
     ORDER BY recurring_id, created_at DESC
  ) AS latest
 WHERE latest.recurring_id = rp.id
   AND rp.last_created_at IS NULL;
