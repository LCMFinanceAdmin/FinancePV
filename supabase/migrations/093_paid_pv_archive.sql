-- 093: Make the paid-PV archive scale.
--
-- Finance Activity loaded every PV in every status into the browser and
-- filtered in JavaScript. That is fine for a few hundred rows and steadily
-- worse for ever after: paid vouchers only accumulate, and they are the ones
-- nobody needs on screen day to day.
--
-- The fix is to leave them in the database and fetch a month at a time, so the
-- indexes below are what actually does the work.

-- Trigram indexes make ILIKE '%text%' searchable without scanning the table,
-- which is what a "find that payment from three years ago" search needs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_pvs_status_paid_at ON pvs(status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvs_paid_at        ON pvs(paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_pvs_payee_trgm   ON pvs USING gin (payee_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pvs_purpose_trgm ON pvs USING gin (purpose     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pvs_pv_no_trgm   ON pvs USING gin (pv_no       gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pvs_ministry ON pvs(ministry);

-- The month a voucher was paid is what files it, so a PAID row without a
-- paid_at has nowhere to go. Any left over from before payment dates were
-- recorded fall back to their submission date — otherwise they would be
-- counted in a month folder but missing from its contents.
UPDATE pvs SET paid_at = submitted_at
  WHERE status = 'PAID' AND paid_at IS NULL AND submitted_at IS NOT NULL;

-- One row per month with a paid voucher — the folder list. Aggregating in the
-- database means the client never has to see the rows to know they exist.
--
-- SECURITY INVOKER (the default) on purpose: the caller's RLS policies still
-- apply, so this cannot become a way to count vouchers someone can't read.
CREATE OR REPLACE FUNCTION paid_pv_months()
RETURNS TABLE (month DATE, pv_count BIGINT, total NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    DATE_TRUNC('month', paid_at)::DATE AS month,
    COUNT(*)                           AS pv_count,
    COALESCE(SUM(amount), 0)           AS total
  FROM pvs
  WHERE status = 'PAID' AND paid_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

GRANT EXECUTE ON FUNCTION paid_pv_months() TO authenticated;
