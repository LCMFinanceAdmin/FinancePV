-- Sending a budget back is a decision of the meeting too.
--
-- 244 made approving name the EXCO resolution that decided it. Rejecting was
-- left alone, and it should not have been: a budget sent back for revision was
-- sent back by the same meeting, and the ministry revising it is owed the same
-- reference as the ministry whose budget was passed.
--
-- It also went straight from the browser as an UPDATE, which is the part worth
-- fixing regardless of references. The policy on budget_proposals is
-- can_write_money() OR is_exco_member(), so any EXCO member could reject any
-- ministry's budget -- including, with a little work, their own rival's -- and
-- the mandatory reason was enforced only by the form that happened to be open.
-- A rejection now goes through a function that checks the same things approving
-- does, and the two paths are symmetrical.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_budget_proposal(
  proposal uuid,
  decided_by_email text,
  p_resolution_ref text,
  p_resolution_date date,
  note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_ref    TEXT := NULLIF(btrim(COALESCE(p_resolution_ref, '')), '');
  v_note   TEXT := NULLIF(btrim(COALESCE(note, '')), '');
  v_status TEXT;
BEGIN
  IF NOT can_record_budget_decision() THEN
    RAISE EXCEPTION 'Only the Treasurer or a Finance Executive may record a budget decision';
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Name the EXCO meeting resolution that sent this budget back';
  END IF;
  IF p_resolution_date IS NULL THEN
    RAISE EXCEPTION 'Give the date of the EXCO meeting';
  END IF;
  IF p_resolution_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'That meeting is in the future. A decision is recorded after the EXCO has met.';
  END IF;
  -- The reason travels back to the ministry and is the whole of what they are
  -- given to work from, so it is required here and not only by the form.
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Give the reason, so the ministry knows what to revise';
  END IF;

  SELECT status INTO v_status FROM budget_proposals WHERE id = proposal;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Budget proposal not found';
  END IF;
  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'That budget is already approved. Ask for a change to a line instead.';
  END IF;

  UPDATE budget_proposals
     SET status = 'REJECTED', decided_by = decided_by_email, decided_at = NOW(),
         decision_note = v_note, resolution_ref = v_ref, resolution_date = p_resolution_date
   WHERE id = proposal;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.reject_budget_proposal(uuid, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.reject_budget_proposal(uuid, text, text, date, text)
  TO authenticated, service_role;

COMMIT;
