-- 123: the limit that actually matters is the budget line.
--
-- 122 put a flat ceiling on each body — the most it may verify on one voucher.
-- That stops a single large payment and nothing else: a committee with RM 5,000
-- of authority could verify three RM 4,000 vouchers against the same project and
-- never touch the ceiling, while the project ran RM 7,000 over its budget.
--
-- What a body may commit is what its budget line has left. So the gate is the
-- project item: its budget, less what has been spent against it, less what is
-- already in the approval chain. Over that, the voucher escalates to the body
-- above, exactly as the flat limit does.
--
-- The arithmetic deliberately mirrors lib/budget-utils.ts getBudgetImpact — the
-- same statuses, the same year rule, the same treatment of a proposal line that
-- is not budget yet. The figure an approver is shown on screen and the figure
-- the server enforces must not be two different calculations, or the page will
-- promise something the action refuses.

CREATE OR REPLACE FUNCTION budget_project_gate(
  p_ministry      TEXT,
  p_project       TEXT,
  p_amount        NUMERIC,
  p_exclude_pv_id UUID DEFAULT NULL
) RETURNS TABLE (
  budget      NUMERIC,
  spent       NUMERIC,
  committed   NUMERIC,
  remaining   NUMERIC,
  budgeted    BOOLEAN,
  over_budget BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH line AS (
    -- Income and expense: only the matching column is populated on a given
    -- line, so summing both yields that line's budget either way. Proposal
    -- lines awaiting the Treasurer are excluded — they are not budget yet.
    SELECT COALESCE(SUM(bi.estimated_income + bi.estimated_expenses), 0) AS amount,
           count(*) > 0                                                  AS found
      FROM budget_items bi
     WHERE bi.ministry = p_ministry
       AND bi.year = EXTRACT(YEAR FROM CURRENT_DATE)::INT
       AND bi.proposal_id IS NULL
       AND COALESCE(bi.project_name, '') = COALESCE(p_project, '')
  ),
  activity AS (
    SELECT
      COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('APPROVED','PAID')), 0) AS spent,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status IN (
        'PENDING_HEAD','PENDING','REVIEWED','MINISTRY_VERIFIED','PENDING_SIGNATORY'
      )), 0) AS committed
      FROM pvs p
     WHERE p.ministry = p_ministry
       AND COALESCE(p.project, '') = COALESCE(p_project, '')
       -- The voucher being decided is already counted as in-flight; without
       -- this its amount would be subtracted twice.
       AND (p_exclude_pv_id IS NULL OR p.id <> p_exclude_pv_id)
  )
  SELECT l.amount,
         a.spent,
         a.committed,
         l.amount - a.spent - a.committed,
         l.found,
         -- An unbudgeted line is not "over budget", it is unbudgeted. Saying
         -- otherwise would block every payment for a ministry that has not
         -- filed a budget this year, which is a different problem and not one
         -- to solve by refusing their vouchers.
         l.found AND p_amount > (l.amount - a.spent - a.committed)
    FROM line l CROSS JOIN activity a;
$$;

REVOKE ALL ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID) TO authenticated;

COMMENT ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID) IS
  'What a budget project item has left, and whether this amount exceeds it. Mirrors getBudgetImpact so screen and server agree.';
