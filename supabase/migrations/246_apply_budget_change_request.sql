-- Approving a budget change request now actually changes the budget.
--
-- The Approve button is offered to the Treasurer, the Bishop, the Secretary,
-- the General Manager and Finance. Applying it wrote straight to budget_items
-- from the browser, and budget_items may only be written by Finance. For an
-- edit or a delete the refusal is silent -- a policy filters rows, it does not
-- raise -- so the page saw no error, marked the request "approved and applied",
-- and reported "Approved and applied to budget" over a budget that had not
-- moved. Four of the five people offered the button were in that position.
--
-- It was also two round trips: apply the change, then mark the request. A
-- failure between them left a request recorded as applied against a budget that
-- was not, or the reverse.
--
-- One function now does both, with definer rights so the people who may decide
-- can also carry it out, and in one transaction so the request and the budget
-- cannot disagree. The caller is checked here rather than by the policy on
-- budget_items, because the point is to let them through deliberately.

BEGIN;

-- Who may decide a change to a budget already in force. The same list the page
-- has always offered the button to; nobody gains the ability, four of them gain
-- the effect.
CREATE OR REPLACE FUNCTION public.can_decide_budget_change()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles u
     WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
       AND u.role::text IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
                            'TREASURER', 'BISHOP', 'SECRETARY', 'GENERAL_MANAGER')
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_decide_budget_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_decide_budget_change() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_budget_change_request(
  request uuid, p_year int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  r      record;
  me     text := auth.jwt() ->> 'email';
  moved  int;
BEGIN
  IF NOT can_decide_budget_change() THEN
    RAISE EXCEPTION 'You may not decide budget change requests';
  END IF;

  SELECT * INTO r FROM budget_change_requests WHERE id = request;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Change request not found';
  END IF;
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
    -- Belt and braces: budget_item_id is ON DELETE SET NULL, so a deleted line
    -- is caught by the null check above. This covers anything that slips past.
    IF moved = 0 THEN
      RAISE EXCEPTION 'That budget line no longer exists';
    END IF;

  ELSIF r.change_type = 'delete' THEN
    IF r.budget_item_id IS NULL THEN
      RAISE EXCEPTION 'The budget line this request refers to has already been deleted';
    END IF;
    DELETE FROM budget_items WHERE id = r.budget_item_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    IF moved = 0 THEN
      RAISE EXCEPTION 'That budget line no longer exists';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown change type %', r.change_type;
  END IF;

  UPDATE budget_change_requests
     SET status = 'approved', approved_by = me, approved_at = now(),
         applied_by = me, applied_at = now()
   WHERE id = request;
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_budget_change_request(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_budget_change_request(uuid, int)
  TO authenticated, service_role;

-- Declining one is the same decision and the same people.
CREATE OR REPLACE FUNCTION public.decline_budget_change_request(
  request uuid, reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  me     text := auth.jwt() ->> 'email';
  v_why  text := NULLIF(btrim(COALESCE(reason, '')), '');
  v_stat text;
BEGIN
  IF NOT can_decide_budget_change() THEN
    RAISE EXCEPTION 'You may not decide budget change requests';
  END IF;
  IF v_why IS NULL THEN
    RAISE EXCEPTION 'Give a reason, so the ministry knows why';
  END IF;
  SELECT status INTO v_stat FROM budget_change_requests WHERE id = request;
  IF v_stat IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_stat <> 'pending' THEN RAISE EXCEPTION 'That request has already been %', v_stat; END IF;

  UPDATE budget_change_requests
     SET status = 'rejected', rejected_by = me, rejected_at = now(),
         rejection_reason = v_why
   WHERE id = request;
END;
$fn$;

REVOKE ALL ON FUNCTION public.decline_budget_change_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_budget_change_request(uuid, text)
  TO authenticated, service_role;

COMMIT;
