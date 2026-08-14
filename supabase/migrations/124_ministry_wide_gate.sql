-- 124: the ministry's overall position, alongside the project line.
--
-- Checking only the project item leaves a gap, and it is the gap 123 opened on
-- purpose. A voucher against a project with no budget line is unbudgeted rather
-- than over budget, so it passes — which is right, because a ministry that has
-- not filed a budget should not have its payments refused. But unbudgeted spend
-- still comes out of the same money. A ministry can therefore sit inside every
-- line it has while spending well past what it was given in total.
--
-- (If every project were budgeted the check would be redundant: the sum of the
-- lines is the total, so staying inside each one keeps you inside the whole.
-- The unbudgeted spend is exactly what makes this worth checking.)
--
-- The function is dropped and recreated rather than replaced because its return
-- columns change, and CREATE OR REPLACE cannot alter those.

DROP FUNCTION IF EXISTS budget_project_gate(TEXT, TEXT, NUMERIC, UUID);

CREATE FUNCTION budget_project_gate(
  p_ministry      TEXT,
  p_project       TEXT,
  p_amount        NUMERIC,
  p_exclude_pv_id UUID DEFAULT NULL
) RETURNS TABLE (
  budget               NUMERIC,
  spent                NUMERIC,
  committed            NUMERIC,
  remaining            NUMERIC,
  budgeted             BOOLEAN,
  over_budget          BOOLEAN,
  ministry_budget      NUMERIC,
  ministry_spent       NUMERIC,
  ministry_committed   NUMERIC,
  ministry_remaining   NUMERIC,
  ministry_budgeted    BOOLEAN,
  over_ministry        BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH items AS (
    -- Every budget line the ministry holds this year. Proposal lines awaiting
    -- the Treasurer are excluded — they are not budget yet.
    SELECT COALESCE(bi.project_name, '') AS project,
           bi.estimated_income + bi.estimated_expenses AS amount
      FROM budget_items bi
     WHERE bi.ministry = p_ministry
       AND bi.year = EXTRACT(YEAR FROM CURRENT_DATE)::INT
       AND bi.proposal_id IS NULL
  ),
  line AS (
    SELECT COALESCE(SUM(amount), 0) AS amount, count(*) > 0 AS found
      FROM items WHERE project = COALESCE(p_project, '')
  ),
  whole AS (
    SELECT COALESCE(SUM(amount), 0) AS amount, count(*) > 0 AS found FROM items
  ),
  -- The ministry's vouchers once, tallied both ways: against this project and
  -- against everything. Two passes over one set rather than two queries.
  activity AS (
    SELECT
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('APPROVED','PAID')
          AND COALESCE(p.project,'') = COALESCE(p_project,'')), 0) AS line_spent,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('PENDING_HEAD','PENDING','REVIEWED','MINISTRY_VERIFIED','PENDING_SIGNATORY')
          AND COALESCE(p.project,'') = COALESCE(p_project,'')), 0) AS line_committed,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('APPROVED','PAID')), 0) AS all_spent,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('PENDING_HEAD','PENDING','REVIEWED','MINISTRY_VERIFIED','PENDING_SIGNATORY')
      ), 0) AS all_committed
      FROM pvs p
     WHERE p.ministry = p_ministry
       -- The voucher being decided is already counted as in-flight; without
       -- this its amount would be subtracted twice.
       AND (p_exclude_pv_id IS NULL OR p.id <> p_exclude_pv_id)
  )
  SELECT
    l.amount,
    a.line_spent,
    a.line_committed,
    l.amount - a.line_spent - a.line_committed,
    l.found,
    l.found AND p_amount > (l.amount - a.line_spent - a.line_committed),
    w.amount,
    a.all_spent,
    a.all_committed,
    w.amount - a.all_spent - a.all_committed,
    w.found,
    -- Same principle as the line: a ministry with no budget at all this year is
    -- unbudgeted, not overspent, and refusing its vouchers would be the wrong
    -- way to raise that.
    w.found AND p_amount > (w.amount - a.all_spent - a.all_committed)
  FROM line l CROSS JOIN whole w CROSS JOIN activity a;
$$;

REVOKE ALL ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID) TO authenticated;

COMMENT ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID) IS
  'What a budget project item and its ministry have left, and whether this amount exceeds either. Mirrors getBudgetImpact so screen and server agree.';
