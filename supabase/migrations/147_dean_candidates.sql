-- 147: the Dean rule, reachable from the Church Directory too.
--
-- A Dean can be set in two places: appointing somebody to the Dean's post on
-- the register, and picking one straight off the district in the Church
-- Directory. 146 put the rule in front of the first and left the second open,
-- so the same decision had one guarded door and one unguarded one.
--
-- This is not a second copy of the rule. It calls office_eligibility() for the
-- district's own Dean post, so there is still one definition and the two pages
-- cannot disagree. What it adds is doing it for every district and every
-- person in a single round trip, because the alternative was one call per
-- person per district on page load.
CREATE OR REPLACE FUNCTION dean_candidates()
RETURNS TABLE (district_id UUID, person_id UUID, reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.district_id,
         p.id,
         office_eligibility(o.id, p.id)
    FROM offices o
    CROSS JOIN people p
   WHERE o.kind = 'DEAN'
     AND o.district_id IS NOT NULL
     AND p.status = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION dean_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dean_candidates() TO authenticated;

COMMENT ON FUNCTION dean_candidates() IS
  'Every district crossed with every active person, and why each cannot be its Dean (null when they can). Delegates to office_eligibility so the rule has one definition.';
