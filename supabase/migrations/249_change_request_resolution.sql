-- A mid-year change to a budget names the meeting that agreed it, too.
--
-- 244 and 245 made approving and sending back the annual budget record the EXCO
-- resolution behind it. A change to a budget already in force changes what that
-- same meeting approved, so it carries the same authority and should carry the
-- same reference. Until now a change request was decided on somebody's say-so
-- and the record said only who pressed the button.
--
-- This changes what the documents say as well as what the app does: deciding a
-- change was described as something the Treasurer and the rest could do without
-- waiting for a meeting. They still press it; what they are pressing is now the
-- recording of a decision, as it is for the budget itself.

BEGIN;

ALTER TABLE budget_change_requests
  ADD COLUMN IF NOT EXISTS resolution_ref  text,
  ADD COLUMN IF NOT EXISTS resolution_date date;

COMMENT ON COLUMN budget_change_requests.resolution_ref IS
  'The EXCO meeting resolution behind this decision. Required to approve or '
  'decline: a change to an approved budget changes what the EXCO approved.';
COMMENT ON COLUMN budget_change_requests.resolution_date IS
  'The date of that meeting.';

CREATE OR REPLACE FUNCTION public.apply_budget_change_request(
  request uuid, p_year int,
  p_resolution_ref text DEFAULT NULL, p_resolution_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  r      record;
  me     text := auth.jwt() ->> 'email';
  v_ref  text := NULLIF(btrim(COALESCE(p_resolution_ref, '')), '');
  moved  int;
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

  ELSE
    RAISE EXCEPTION 'Unknown change type %', r.change_type;
  END IF;

  UPDATE budget_change_requests
     SET status = 'approved', approved_by = me, approved_at = now(),
         applied_by = me, applied_at = now(),
         resolution_ref = v_ref, resolution_date = p_resolution_date
   WHERE id = request;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.decline_budget_change_request(
  request uuid, reason text,
  p_resolution_ref text DEFAULT NULL, p_resolution_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  me     text := auth.jwt() ->> 'email';
  v_why  text := NULLIF(btrim(COALESCE(reason, '')), '');
  v_ref  text := NULLIF(btrim(COALESCE(p_resolution_ref, '')), '');
  v_stat text;
BEGIN
  IF NOT can_decide_budget_change() THEN
    RAISE EXCEPTION 'You may not decide budget change requests';
  END IF;
  IF v_why IS NULL THEN
    RAISE EXCEPTION 'Give a reason, so the ministry knows why';
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Name the EXCO meeting resolution that declined this change';
  END IF;
  IF p_resolution_date IS NULL THEN
    RAISE EXCEPTION 'Give the date of the EXCO meeting';
  END IF;
  IF p_resolution_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'That meeting is in the future. A decision is recorded after the EXCO has met.';
  END IF;

  SELECT status INTO v_stat FROM budget_change_requests WHERE id = request;
  IF v_stat IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_stat <> 'pending' THEN RAISE EXCEPTION 'That request has already been %', v_stat; END IF;

  UPDATE budget_change_requests
     SET status = 'rejected', rejected_by = me, rejected_at = now(),
         rejection_reason = v_why,
         resolution_ref = v_ref, resolution_date = p_resolution_date
   WHERE id = request;
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_budget_change_request(uuid, int, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_budget_change_request(uuid, int, text, date)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decline_budget_change_request(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_budget_change_request(uuid, text, text, date)
  TO authenticated, service_role;

-- The two-argument forms from 246 lasted a day. Dropped rather than left to
-- raise: 246 went out this morning and no browser is holding a page that calls
-- them.
DROP FUNCTION IF EXISTS public.apply_budget_change_request(uuid, int);
DROP FUNCTION IF EXISTS public.decline_budget_change_request(uuid, text);

COMMIT;
