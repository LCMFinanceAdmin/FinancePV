-- The ministry allocation is what the EXCO approved
--
-- The EXCO votes an allocation per ministry and sets out a general outline of
-- what it is for — National Day of Prayer, skill-based training, communication
-- tools — without approving the exact project items. The app had it the other
-- way round: there was no allocation anywhere, so the approved figure was
-- whatever the project lines happened to add up to, and a line running out read
-- as a breach of something the EXCO had never decided.
--
-- Three changes follow from putting the allocation first.
--
--   1. budget_proposals gains an `allocation`: the figure the EXCO voted. The
--      lines beneath it are the outline, and may add up to less, leaving
--      headroom for what was too early to plan. Where no allocation was
--      recorded the outline's total still stands in for it, so ministries
--      budgeted the old way are unaffected.
--
--   2. Spend that names no line, or names something not in the outline, is no
--      longer invisible. The gate reports it as unplanned, against the
--      allocation, so the EXCO can see how much of what it voted went to
--      things nobody listed.
--
--   3. A line being exhausted is not an overspend while the ministry still has
--      room — the expense draws on the rest of the allocation. Only passing the
--      allocation itself is reported as over.
--
-- A fourth change is a plain defect. The gate matched a voucher's project to a
-- budget line with `=`, so "Vietnam 5 " counted against no line, while
-- lib/budget-line.ts — which the budget page and the voucher use — matched the
-- same two strings with case, surrounding space and doubled space ignored. The
-- server and the client could disagree about what a ministry had spent. Both
-- now use one comparison, written here as budget_line_key.

BEGIN;

-- ---------------------------------------------------------------------------
-- One comparison, matching lib/budget-line.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION budget_line_key(s TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(btrim(regexp_replace(COALESCE(s, ''), '\s+', ' ', 'g')))
$$;

COMMENT ON FUNCTION budget_line_key(TEXT) IS
  'Case, surrounding space and doubled space are not differences anybody means. '
  'Must stay in step with key() in lib/budget-line.ts.';

-- ---------------------------------------------------------------------------
-- The allocation
-- ---------------------------------------------------------------------------
ALTER TABLE budget_proposals
  ADD COLUMN IF NOT EXISTS allocation NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budget_proposals_allocation_not_negative'
  ) THEN
    ALTER TABLE budget_proposals
      ADD CONSTRAINT budget_proposals_allocation_not_negative
      CHECK (allocation IS NULL OR allocation >= 0);
  END IF;
END $$;

COMMENT ON COLUMN budget_proposals.allocation IS
  'What the EXCO voted this ministry for the year. The project lines are the '
  'outline of what it is for and may add up to less. Null where no allocation '
  'was recorded, and then the outline total stands in for it.';

-- Once the EXCO has approved an allocation, the holder cannot quietly revise
-- it. Altering it afterwards goes through a change request, which carries the
-- resolution of the meeting that agreed it.
CREATE OR REPLACE FUNCTION budget_allocation_needs_a_resolution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'APPROVED'
     AND COALESCE(NEW.allocation, -1) <> COALESCE(OLD.allocation, -1)
     AND COALESCE(current_setting('lcm.budget_resolution', true), '') <> 'on' THEN
    RAISE EXCEPTION
      'The EXCO approved this allocation. Raise a budget change request to alter it.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS budget_allocation_needs_a_resolution ON budget_proposals;
CREATE TRIGGER budget_allocation_needs_a_resolution
  BEFORE UPDATE ON budget_proposals
  FOR EACH ROW EXECUTE FUNCTION budget_allocation_needs_a_resolution();

-- ---------------------------------------------------------------------------
-- The gate, reporting against the allocation
--
-- Still read-only and still advisory: it says where a voucher stands, and the
-- signatory decides. The return shape grows, so it is dropped and rebuilt.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INTEGER);

CREATE FUNCTION budget_project_gate(
  p_ministry      TEXT,
  p_project       TEXT,
  p_amount        NUMERIC,
  p_exclude_pv_id UUID    DEFAULT NULL,
  p_year          INTEGER DEFAULT NULL
)
RETURNS TABLE (
  budget              NUMERIC,
  spent               NUMERIC,
  committed           NUMERIC,
  remaining           NUMERIC,
  budgeted            BOOLEAN,
  over_budget         BOOLEAN,
  ministry_budget     NUMERIC,
  ministry_spent      NUMERIC,
  ministry_committed  NUMERIC,
  ministry_remaining  NUMERIC,
  ministry_budgeted   BOOLEAN,
  over_ministry       BOOLEAN,
  year                INTEGER,
  -- What the EXCO voted, and whether that is a figure it set or the outline's
  -- total standing in for one.
  allocation          NUMERIC,
  allocation_voted    BOOLEAN,
  -- The outline, and the part of the allocation it does not account for.
  planned             NUMERIC,
  headroom            NUMERIC,
  -- Spend naming no line, or a line that is not in the outline.
  unplanned_spent     NUMERIC,
  unplanned_committed NUMERIC,
  -- The line is out but the ministry is not: the expense draws on the rest of
  -- the allocation rather than breaching anything.
  drawn_from_ministry BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH params AS (
    SELECT COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) AS yr,
           budget_line_key(p_project) AS want
  ),
  items AS (
    SELECT budget_line_key(bi.project_name) AS project,
           bi.estimated_income + bi.estimated_expenses AS amount
      FROM budget_items bi, params
     WHERE bi.ministry = p_ministry
       AND bi.year = params.yr
       -- Proposal lines awaiting the Treasurer are not budget yet.
       AND bi.proposal_id IS NULL
  ),
  line AS (
    SELECT COALESCE(SUM(i.amount), 0) AS amount, count(*) > 0 AS found
      FROM items i, params WHERE i.project = params.want
  ),
  outline AS (
    SELECT COALESCE(SUM(amount), 0) AS amount, count(*) > 0 AS found FROM items
  ),
  voted AS (
    SELECT bp.allocation
      FROM budget_proposals bp, params
     WHERE bp.ministry = p_ministry
       AND bp.year = params.yr
       AND bp.status = 'APPROVED'
       AND bp.allocation IS NOT NULL
     ORDER BY bp.decided_at DESC NULLS LAST
     LIMIT 1
  ),
  -- The ministry's vouchers for that year, tallied three ways in one pass:
  -- against this project, against everything, and against whatever names no
  -- line at all. A voucher's own date decides which year it belongs to,
  -- falling back to when it was submitted for the handful that arrive without.
  activity AS (
    SELECT
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('APPROVED','PAID')
          AND budget_line_key(p.project) = params.want), 0) AS line_spent,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('PENDING_HEAD','PENDING','REVIEWED','MINISTRY_VERIFIED','PENDING_SIGNATORY')
          AND budget_line_key(p.project) = params.want), 0) AS line_committed,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('APPROVED','PAID')), 0) AS all_spent,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('PENDING_HEAD','PENDING','REVIEWED','MINISTRY_VERIFIED','PENDING_SIGNATORY')
      ), 0) AS all_committed,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('APPROVED','PAID')
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.project = budget_line_key(p.project))
      ), 0) AS unplanned_spent,
      COALESCE(SUM(p.amount) FILTER (
        WHERE p.status IN ('PENDING_HEAD','PENDING','REVIEWED','MINISTRY_VERIFIED','PENDING_SIGNATORY')
          AND NOT EXISTS (SELECT 1 FROM items i WHERE i.project = budget_line_key(p.project))
      ), 0) AS unplanned_committed
      FROM pvs p, params
     WHERE p.ministry = p_ministry
       AND EXTRACT(YEAR FROM COALESCE(p.date, p.submitted_at::DATE))::INT = params.yr
       AND (p_exclude_pv_id IS NULL OR p.id <> p_exclude_pv_id)
  ),
  figures AS (
    SELECT
      l.amount AS line_amount, l.found AS line_found,
      o.amount AS planned, o.found AS outline_found,
      a.*,
      v.allocation IS NOT NULL AS allocation_voted,
      COALESCE(v.allocation, o.amount) AS allocation,
      params.yr
      FROM line l CROSS JOIN outline o CROSS JOIN activity a
           CROSS JOIN params LEFT JOIN voted v ON TRUE
  )
  SELECT
    f.line_amount,
    f.line_spent,
    f.line_committed,
    f.line_amount - f.line_spent - f.line_committed,
    f.line_found,
    -- Kept for the callers that read it, but a line running out is no longer
    -- the headline: drawn_from_ministry says whether it matters.
    f.line_found AND p_amount > (f.line_amount - f.line_spent - f.line_committed),
    f.allocation,
    f.all_spent,
    f.all_committed,
    f.allocation - f.all_spent - f.all_committed,
    f.allocation_voted OR f.outline_found,
    (f.allocation_voted OR f.outline_found)
      AND p_amount > (f.allocation - f.all_spent - f.all_committed),
    f.yr,
    f.allocation,
    f.allocation_voted,
    f.planned,
    f.allocation - f.planned,
    f.unplanned_spent,
    f.unplanned_committed,
    -- Out of line, but the allocation still covers it.
    f.line_found
      AND p_amount > (f.line_amount - f.line_spent - f.line_committed)
      AND p_amount <= (f.allocation - f.all_spent - f.all_committed)
  FROM figures f;
$$;

COMMENT ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INTEGER) IS
  'Where one voucher stands against its line and against the ministry '
  'allocation. Reports only — approving past the allocation is the signatory''s '
  'decision, and the allocation itself is changed by EXCO resolution.';

-- ---------------------------------------------------------------------------
-- Changing an approved allocation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_budget_change_request(
  request            UUID,
  p_year             INTEGER,
  p_resolution_ref   TEXT DEFAULT NULL,
  p_resolution_date  DATE DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r      record;
  me     text := auth.jwt() ->> 'email';
  v_ref  text := NULLIF(btrim(COALESCE(p_resolution_ref, '')), '');
  moved  int;
  v_new  numeric;
BEGIN
  IF NOT can_decide_budget_change() THEN
    RAISE EXCEPTION 'You may not decide budget change requests';
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Name the EXCO meeting resolution that agreed this change';
  END IF;
  IF p_resolution_date IS NULL THEN
    RAISE EXCEPTION 'Give the date of the EXCO meeting';
  END IF;
  IF p_resolution_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'That meeting is in the future. A change is recorded after the EXCO has met.';
  END IF;

  SELECT * INTO r FROM budget_change_requests WHERE id = request;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'That request has already been %', r.status;
  END IF;

  IF r.change_type = 'add' THEN
    IF COALESCE(btrim(r.proposed_data->>'project_name'), '') = '' THEN
      RAISE EXCEPTION 'That request does not name the line to add';
    END IF;
    INSERT INTO budget_items(
      ministry, year, project_name, project_type, description,
      estimated_income, estimated_expenses, special_notes,
      document_url, document_name, parent_id, created_by)
    VALUES (
      r.ministry, p_year,
      r.proposed_data->>'project_name',
      COALESCE(r.proposed_data->>'project_type', 'expense'),
      r.proposed_data->>'description',
      COALESCE((r.proposed_data->>'estimated_income')::numeric, 0),
      COALESCE((r.proposed_data->>'estimated_expenses')::numeric, 0),
      r.proposed_data->>'special_notes',
      r.proposed_data->>'document_url',
      r.proposed_data->>'document_name',
      NULLIF(r.proposed_data->>'parent_id', '')::uuid,
      r.requested_by);

  ELSIF r.change_type = 'edit' THEN
    IF r.budget_item_id IS NULL THEN
      RAISE EXCEPTION 'The budget line this request refers to has been deleted';
    END IF;
    UPDATE budget_items b SET
      project_name       = COALESCE(r.proposed_data->>'project_name', b.project_name),
      project_type       = COALESCE(r.proposed_data->>'project_type', b.project_type),
      description        = COALESCE(r.proposed_data->>'description', b.description),
      estimated_income   = COALESCE((r.proposed_data->>'estimated_income')::numeric, b.estimated_income),
      estimated_expenses = COALESCE((r.proposed_data->>'estimated_expenses')::numeric, b.estimated_expenses),
      special_notes      = COALESCE(r.proposed_data->>'special_notes', b.special_notes),
      document_url       = COALESCE(r.proposed_data->>'document_url', b.document_url),
      document_name      = COALESCE(r.proposed_data->>'document_name', b.document_name),
      updated_at         = now()
     WHERE b.id = r.budget_item_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    IF moved = 0 THEN RAISE EXCEPTION 'That budget line no longer exists'; END IF;

  ELSIF r.change_type = 'delete' THEN
    IF r.budget_item_id IS NULL THEN
      RAISE EXCEPTION 'The budget line this request refers to has already been deleted';
    END IF;
    DELETE FROM budget_items WHERE id = r.budget_item_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    IF moved = 0 THEN RAISE EXCEPTION 'That budget line no longer exists'; END IF;

  ELSIF r.change_type = 'allocation' THEN
    -- What the ministry is allocated for the year, which only the EXCO decides.
    IF COALESCE(btrim(r.proposed_data->>'allocation'), '') = '' THEN
      RAISE EXCEPTION 'That request does not say what the allocation should be';
    END IF;
    v_new := (r.proposed_data->>'allocation')::numeric;
    IF v_new < 0 THEN
      RAISE EXCEPTION 'An allocation cannot be negative';
    END IF;

    PERFORM set_config('lcm.budget_resolution', 'on', true);
    UPDATE budget_proposals
       SET allocation = v_new
     WHERE ministry = r.ministry AND year = p_year AND status = 'APPROVED';
    GET DIAGNOSTICS moved = ROW_COUNT;
    IF moved = 0 THEN
      RAISE EXCEPTION 'There is no approved budget for % in % to re-allocate',
        r.ministry, p_year;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown change type %', r.change_type;
  END IF;

  UPDATE budget_change_requests
     SET status = 'approved', approved_by = me, approved_at = now(),
         applied_by = me, applied_at = now(),
         resolution_ref = v_ref, resolution_date = p_resolution_date
   WHERE id = request;
END $$;

-- Postgres grants EXECUTE to PUBLIC by default and anon inherits it, so a
-- definer function is open to the world until this is said.
REVOKE EXECUTE ON FUNCTION budget_line_key(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION budget_allocation_needs_a_resolution() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apply_budget_change_request(UUID, INTEGER, TEXT, DATE) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION budget_line_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION budget_project_gate(TEXT, TEXT, NUMERIC, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_budget_change_request(UUID, INTEGER, TEXT, DATE) TO authenticated;

COMMIT;
