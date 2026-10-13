-- An EXCO member's budget papers are their own ministry's.
--
-- 237 handed the budget proposals and change requests back to the ministries,
-- using is_exco_member(), which asks whether you hold any portfolio at all. It
-- does not ask which. So the EXCO member for Orang Asli could edit, and delete,
-- the submitted budget proposal of Education, Mission or any other ministry --
-- confirmed by attempting it, not by reading the predicate.
--
-- The page never offered that: it shows an EXCO member only their own
-- ministries. But the page is not the control, and a budget proposal is the
-- document a ministry's year is argued from.

BEGIN;

-- Do I hold this ministry? Names are compared the way the rest of the app
-- compares them, because "Orang Asli" and "orang asli " are the same ministry
-- to everybody except a string equality test.
CREATE OR REPLACE FUNCTION public.holds_ministry(p_ministry text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles u
     WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
       AND lower(btrim(COALESCE(p_ministry, ''))) = ANY (
             SELECT lower(btrim(x)) FROM unnest(COALESCE(u.ministries, '{}')) x)
  );
$fn$;

REVOKE ALL ON FUNCTION public.holds_ministry(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.holds_ministry(text) TO authenticated, service_role;

-- Finance keeps the whole book; a ministry keeps its own page of it.
DROP POLICY IF EXISTS budget_proposals_insert ON budget_proposals;
CREATE POLICY budget_proposals_insert ON budget_proposals FOR INSERT TO authenticated
  WITH CHECK (can_write_money() OR holds_ministry(ministry));

DROP POLICY IF EXISTS budget_proposals_update ON budget_proposals;
CREATE POLICY budget_proposals_update ON budget_proposals FOR UPDATE TO authenticated
  USING (can_write_money() OR holds_ministry(ministry))
  WITH CHECK (can_write_money() OR holds_ministry(ministry));

DROP POLICY IF EXISTS budget_proposals_delete ON budget_proposals;
CREATE POLICY budget_proposals_delete ON budget_proposals FOR DELETE TO authenticated
  USING (can_write_money() OR holds_ministry(ministry));

DROP POLICY IF EXISTS budget_change_requests_insert ON budget_change_requests;
CREATE POLICY budget_change_requests_insert ON budget_change_requests FOR INSERT TO authenticated
  WITH CHECK (can_write_money() OR holds_ministry(ministry));

DROP POLICY IF EXISTS budget_change_requests_update ON budget_change_requests;
CREATE POLICY budget_change_requests_update ON budget_change_requests FOR UPDATE TO authenticated
  USING (can_write_money() OR holds_ministry(ministry))
  WITH CHECK (can_write_money() OR holds_ministry(ministry));

DROP POLICY IF EXISTS budget_change_requests_delete ON budget_change_requests;
CREATE POLICY budget_change_requests_delete ON budget_change_requests FOR DELETE TO authenticated
  USING (can_write_money() OR holds_ministry(ministry));

-- Deciding a request is not writing one, and goes through
-- apply_budget_change_request / decline_budget_change_request (246), which hold
-- definer rights and check the caller themselves. The Treasurer and the rest
-- are unaffected by the narrowing above.

COMMIT;
