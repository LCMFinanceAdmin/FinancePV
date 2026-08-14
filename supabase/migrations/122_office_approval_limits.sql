-- 122: what a body may authorise on its own.
--
-- Verification was all-or-nothing: the holder of a portfolio could verify any
-- voucher against their ministry, for any amount. The signatory tiers further
-- down catch large sums — the Treasurer alone to RM 30,000, two officers above
-- it — but those are the church's officers signing at the end. They say nothing
-- about how much a committee may commit in the first place.
--
-- A limit belongs on the body, not on the person, and it is only meaningful
-- alongside the hierarchy added in 121: exceeding it is not a refusal, it is an
-- escalation to the body above. A project committee with RM 5,000 of authority
-- that needs RM 8,000 does not stop — the portfolio it sits under verifies
-- instead.
--
-- NULL means no limit of its own. That is the default and it preserves today's
-- behaviour exactly, so nothing changes until somebody sets a figure.

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS approval_limit NUMERIC(12,2);

ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_approval_limit_positive;
ALTER TABLE offices ADD CONSTRAINT offices_approval_limit_positive
  CHECK (approval_limit IS NULL OR approval_limit >= 0);

COMMENT ON COLUMN offices.approval_limit IS
  'The most this body may verify on one voucher, in RM. NULL means no limit of its own. Above it, the post it sits under verifies instead.';

-- ── Who may verify this amount for this ministry ──────────────────────────
-- Answers the whole question in one place: is there a limit, is this over it,
-- and if so which body it has gone up to. The edge function enforces it and the
-- queue explains it, and neither should be re-deriving the rule.
--
-- Matched on the office name against pvs.ministry, which is how the EXCO check
-- has always worked. A voucher whose ministry names no office simply has no
-- limit — the same as today.
CREATE OR REPLACE FUNCTION ministry_approval_gate(p_ministry TEXT, p_amount NUMERIC)
RETURNS TABLE (
  office_name  TEXT,
  limit_amount NUMERIC,
  over_limit   BOOLEAN,
  escalates_to TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name,
         o.approval_limit,
         o.approval_limit IS NOT NULL AND p_amount > o.approval_limit,
         parent.name
    FROM offices o
    LEFT JOIN offices parent ON parent.id = o.parent_office_id
   WHERE lower(o.name) = lower(p_ministry)
     AND o.active
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION ministry_approval_gate(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ministry_approval_gate(TEXT, NUMERIC) TO authenticated;
