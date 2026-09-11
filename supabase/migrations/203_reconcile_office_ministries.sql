-- 203: make the office -> ministry derivation reconcilable.
--
-- 197 derives a portfolio from an office holding with an AFTER INSERT trigger,
-- which works only if the person's account already exists at the moment the
-- holding is recorded. Recording Reena Lew's Education Desk holding in 202 left
-- her ministries empty for exactly that reason, and nothing would ever have
-- corrected it: the trigger does not fire again, and the holding looks right in
-- Settings, so the gap is invisible from the screen where you would look.
--
-- The same gap opens whenever an office is filled before the account is made,
-- which is the normal order of events in a church — somebody is elected, and
-- their login is arranged afterwards.
--
-- So the derivation becomes something that can be re-run rather than a single
-- event that must land in the right order. Additive, like the trigger: it adds
-- the portfolios an office implies and never removes one granted by hand.

CREATE OR REPLACE FUNCTION reconcile_office_ministries()
RETURNS TABLE (email TEXT, added TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  ), missing AS (
    SELECT i.addr, i.ministry
      FROM implied i
      JOIN user_roles u ON lower(u.email) = i.addr
     WHERE NOT (i.ministry = ANY (COALESCE(u.ministries, ARRAY[]::TEXT[])))
  ), applied AS (
    UPDATE user_roles u
       SET ministries = (
             SELECT array_agg(DISTINCT x)
               FROM unnest(
                 COALESCE(u.ministries, ARRAY[]::TEXT[])
                 || ARRAY(SELECT DISTINCT mi.ministry FROM missing mi WHERE mi.addr = lower(u.email))
               ) AS x
           ),
           updated_at = NOW()
     WHERE lower(u.email) IN (SELECT DISTINCT addr FROM missing)
    RETURNING u.email
  )
  SELECT a.email::TEXT,
         (SELECT string_agg(DISTINCT mi.ministry, ', ')
            FROM missing mi WHERE mi.addr = lower(a.email))::TEXT
    FROM applied a;
END;
$$;

GRANT EXECUTE ON FUNCTION reconcile_office_ministries() TO authenticated;

COMMENT ON FUNCTION reconcile_office_ministries() IS
  'Adds every portfolio implied by a current EXCO/PROJECT office holding to the holder''s account. Safe to re-run; never removes a ministry. Covers the case where the office was filled before the account existed, which the AFTER INSERT trigger cannot.';

SELECT * FROM reconcile_office_ministries();
