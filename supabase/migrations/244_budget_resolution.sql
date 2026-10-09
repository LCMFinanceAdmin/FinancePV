-- A budget is approved by the EXCO in meeting. The app records that.
--
-- The annual budget is decided by the EXCO voting at a meeting called for the
-- budget and nothing else. Pressing Approve does not make a budget approved --
-- the meeting did -- it puts the agreed figures live so claims can be charged
-- against them. So the record should say which meeting, and until now it could
-- not: the proposal stored who pressed the button and when, which is not the
-- same question.
--
-- Two columns and a required argument, following the pattern a payment voucher
-- already uses for spending an EXCO has resolved on (exco_resolution_ref,
-- exco_resolution_date). The app cannot verify that a vote happened; what it
-- can do is refuse to record an approval that does not name one, so the figures
-- and the minute book point at each other.
--
-- And a hole closed on the way past. approve_budget_proposal holds definer
-- rights, is granted to authenticated, and asked nothing about its caller: any
-- signed-in person could approve any ministry's budget by calling it directly.
-- The button was hidden from them, which is not the same as the action being
-- refused -- 212 is the precedent and the reason this now checks for itself.

BEGIN;

ALTER TABLE budget_proposals
  ADD COLUMN IF NOT EXISTS resolution_ref  text,
  ADD COLUMN IF NOT EXISTS resolution_date date;

COMMENT ON COLUMN budget_proposals.resolution_ref IS
  'The EXCO meeting resolution that approved this budget. Required to approve; '
  'the decision belongs to the meeting, and this is what points at it.';
COMMENT ON COLUMN budget_proposals.resolution_date IS
  'The date of that meeting.';

-- Who may write a meeting''s decision down. Not who decides it: the EXCO does
-- that. This is the same pair the page has always offered the button to, so
-- nobody gains or loses the ability to record -- the Treasurer normally, and
-- the Finance Executive so that a resolution is never held up by one person
-- being away.
CREATE OR REPLACE FUNCTION public.can_record_budget_decision()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles u
     WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
       AND u.role::text IN ('TREASURER', 'FINANCE_ADMIN',
                            'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3')
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_record_budget_decision() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_record_budget_decision()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_budget_proposal(
  proposal uuid,
  decided_by_email text,
  p_resolution_ref text,
  p_resolution_date date,
  note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  target_ministry TEXT;
  target_year     INT;
  v_ref           TEXT := NULLIF(btrim(COALESCE(p_resolution_ref, '')), '');
BEGIN
  IF NOT can_record_budget_decision() THEN
    RAISE EXCEPTION 'Only the Treasurer or a Finance Executive may record a budget decision';
  END IF;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Name the EXCO meeting resolution that approved this budget';
  END IF;
  IF p_resolution_date IS NULL THEN
    RAISE EXCEPTION 'Give the date of the EXCO meeting that approved this budget';
  END IF;
  IF p_resolution_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'That meeting is in the future. A budget is recorded after the EXCO has met.';
  END IF;

  SELECT ministry, year INTO target_ministry, target_year
    FROM budget_proposals WHERE id = proposal;
  IF target_ministry IS NULL THEN
    RAISE EXCEPTION 'Budget proposal not found';
  END IF;

  -- Replace any live lines for that ministry/year, so approving a revised
  -- proposal doesn't leave superseded lines behind alongside it.
  DELETE FROM budget_items
   WHERE ministry = target_ministry AND year = target_year AND proposal_id IS NULL;

  UPDATE budget_items SET proposal_id = NULL WHERE proposal_id = proposal;

  UPDATE budget_proposals
     SET status = 'APPROVED', decided_by = decided_by_email,
         decided_at = NOW(), decision_note = note,
         resolution_ref = v_ref, resolution_date = p_resolution_date
   WHERE id = proposal;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.approve_budget_proposal(uuid, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.approve_budget_proposal(uuid, text, text, date, text)
  TO authenticated, service_role;

-- The old three-argument form stays, and refuses. A browser still running the
-- previous build would otherwise get "function does not exist", which reads
-- like a fault in the app rather than a page that needs reloading.
CREATE OR REPLACE FUNCTION public.approve_budget_proposal(
  proposal uuid, decided_by_email text, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. Approving a budget now '
                  'records the EXCO meeting resolution that decided it.';
END;
$fn$;

REVOKE ALL ON FUNCTION public.approve_budget_proposal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_budget_proposal(uuid, text, text)
  TO authenticated, service_role;

COMMIT;
