-- 125: measure a voucher against its own year.
--
-- The gate read budget_items for the current calendar year and tallied spend
-- from every year at once. Both halves are wrong once the system has been
-- running for more than one year, and they are wrong in opposite directions:
--
--   * A voucher dated December 2026, verified in January 2027, was measured
--     against 2027's budget — a line that may not exist yet, making a properly
--     budgeted expense look unbudgeted.
--
--   * Worse, spend never reset. Three years of vouchers accumulated against one
--     year's budget, so every ministry would eventually appear to have exhausted
--     a line it had barely touched, and the escalation would fire on everything.
--
-- The second has not bitten only because the oldest voucher here is from June
-- 2026. It would have started in January.
--
-- Both halves now key on the same year: the one the voucher itself is dated to.

DROP FUNCTION IF EXISTS budget_project_gate(TEXT, TEXT, NUMERIC, UUID);

CREATE FUNCTION budget_project_gate(
  p_ministry      TEXT,
  p_project       TEXT,
  p_amount        NUMERIC,
  p_exclude_pv_id UUID DEFAULT NULL,
  -- The voucher's own year. Defaults to the current one, which is right for a
  -- payment being raised today and is what every existing caller means.
  p_year          INT DEFAULT NULL
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
  over_ministry        BOOLEAN,
  year                 INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) AS yr
  ),
  items AS (
    SELECT COALESCE(bi.project_name, '') AS project,
           bi.estimated_income + bi.estimated_expenses AS amount
      FROM budget_items bi, params
     WHERE bi.ministry = p_ministry
       AND bi.year = params.yr
       -- Proposal lines awaiting the Treasurer are not budget yet.
       AND bi.proposal_id IS NULL
  ),
  line AS (
    SELECT COALESCE(SUM(amount), 0) AS amount, count(*) > 0 AS found
      FROM items WHERE project = COALESCE(p_project, '')
  ),
  whole AS (
    SELECT COALESCE(SUM(amount), 0) AS amount, count(*) > 0 AS found FROM items
  ),
  -- The ministry's vouchers for that year, tallied both ways in one pass:
  -- against this project and against everything. A voucher's own date decides
  -- which year it belongs to, falling back to when it was submitted for the
  -- handful of rows that might arrive without one.
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
      FROM pvs p, params
     WHERE p.ministry = p_ministry
       AND EXTRACT(YEAR FROM COALESCE(p.date, p.submitted_at::DATE))::INT = params.yr
       AND (p_exclude_pv_id IS NULL OR p.id <> p_exclude_pv_id)
  )
  SELECT
    l.amount, a.line_spent, a.line_committed,
    l.amount - a.line_spent - a.line_committed,
    l.found,
    l.found AND p_amount > (l.amount - a.line_spent - a.line_committed),
    w.amount, a.all_spent, a.all_committed,
    w.amount - a.all_spent - a.all_committed,
    w.found,
    w.found AND p_amount > (w.amount - a.all_spent - a.all_committed),
    params.yr
  FROM line l CROSS JOIN whole w CROSS JOIN activity a CROSS JOIN params;
$$;

REVOKE ALL ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INT) TO authenticated;

COMMENT ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INT) IS
  'What a budget project item and its ministry have left in a given year, and whether this amount exceeds either. Budget and spend both key on the voucher''s own year.';
