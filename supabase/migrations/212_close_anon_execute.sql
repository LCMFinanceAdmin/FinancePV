-- 212: functions this session added were reachable without signing in.
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC unless told otherwise,
-- and Supabase's anon role inherits PUBLIC. Every function added this session
-- therefore went out callable by anybody holding the anon key, which is shipped
-- to the browser. Two of them should never have been:
--
--   reconcile_office_ministries() is SECURITY DEFINER and writes user_roles,
--   so an unauthenticated caller could invoke a privileged write. It only ever
--   adds a portfolio an office holding already implies, so the blast radius is
--   small — but "small" is not the standard for who may write to the table that
--   decides who approves the church's payments.
--
--   resolve_role_email() answered for anybody. Given an address it says whether
--   that address is a known account and which account it belongs to, so
--   mission@lcm.org.my returned eric.mau@lcm.org.my to a caller with no session
--   at all. That is an address-linking oracle over real people, free to query.
--
-- Proven before fixing, as the anon role:
--   anon calls reconcile_office_ministries  RAN, returned 0 rows
--   anon resolves an address                RAN, mission@ -> eric.mau@
--   anon calls a trigger function           blocked by Postgres itself
--
-- Trigger functions are safe on their own account: Postgres refuses to call one
-- outside a trigger, which is why the other nine writing definers on that list
-- are not a way in.

REVOKE EXECUTE ON FUNCTION resolve_role_email(TEXT)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION reconcile_office_ministries()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION revert_to_default_role()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION can_manage_access()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION ministry_has_verifier(TEXT[], TEXT) FROM PUBLIC, anon;

-- Signed in for the web app; service_role for the edge functions, which resolve
-- the alias on every action.
GRANT EXECUTE ON FUNCTION resolve_role_email(TEXT)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reconcile_office_ministries()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION revert_to_default_role()          TO authenticated;
-- Evaluated inside the user_roles policy, so the querying role must reach it.
GRANT EXECUTE ON FUNCTION can_manage_access()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ministry_has_verifier(TEXT[], TEXT) TO authenticated, service_role;

-- And the reconciler checks for itself, rather than relying on the grant alone.
-- A definer function that writes should not be one REVOKE away from being an
-- open endpoint.
CREATE OR REPLACE FUNCTION reconcile_office_ministries()
RETURNS TABLE (email TEXT, added TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_manage_access() THEN
    RAISE EXCEPTION 'Only somebody who administers access may reconcile portfolios';
  END IF;

  RETURN QUERY
  WITH implied AS (
    SELECT lower(e.addr) AS addr, m.name AS ministry
      FROM office_holdings h
      JOIN offices o    ON o.id = h.office_id AND o.kind IN ('EXCO', 'PROJECT')
      JOIN ministries m ON m.name = o.name
      JOIN people p     ON p.id = h.person_id
      CROSS JOIN LATERAL unnest(
        array_remove(ARRAY[lower(p.user_email), lower(p.work_email)], NULL)
      ) AS e(addr)
     WHERE h.term_end IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM ministry_verifiers v
          WHERE v.active AND v.person_id = h.person_id
            AND cardinality(COALESCE(v.projects, ARRAY[]::TEXT[])) > 0
       )
  ), missing AS (
    SELECT DISTINCT i.addr, i.ministry
      FROM implied i
      JOIN user_roles u ON lower(u.email) = i.addr
     WHERE u.role <> 'MINISTRY_SUPPORT'
       AND NOT (i.ministry = ANY (COALESCE(u.ministries, ARRAY[]::TEXT[])))
  ), agg AS (
    SELECT m.addr, array_agg(DISTINCT m.ministry) AS ministries FROM missing m GROUP BY m.addr
  ), applied AS (
    UPDATE user_roles u
       SET ministries = ARRAY(
             SELECT DISTINCT x FROM unnest(COALESCE(u.ministries, ARRAY[]::TEXT[]) || a.ministries) AS x),
           updated_at = NOW()
      FROM agg a
     WHERE lower(u.email) = a.addr
    RETURNING u.email AS e, a.ministries AS added
  )
  SELECT ap.e::TEXT, array_to_string(ap.added, ', ')::TEXT FROM applied ap;
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_office_ministries() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION reconcile_office_ministries() TO authenticated, service_role;

SELECT p.proname::text AS fn,
       EXISTS (SELECT 1 FROM aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
                WHERE r.rolname='anon' AND a.privilege_type='EXECUTE') AS anon_can_call
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('resolve_role_email','reconcile_office_ministries',
                     'revert_to_default_role','can_manage_access','ministry_has_verifier')
 ORDER BY 1;
