-- 205: reconcile properly, and stop it re-widening a scoped delegate.
--
-- Two faults in 203. The correlated reference from the data-modifying CTE back
-- into `missing` did not take, so the update reported rows it had not actually
-- changed — Reena Lew was announced as granted Education Desk and left empty.
-- Rewritten as UPDATE ... FROM over a pre-aggregated set, which is what it
-- should have been.
--
-- The second is the one that matters. 203 also "reconciled" Chan Mun Kwan,
-- widening him from the single budget line 198 deliberately scoped him to, to
-- the whole of Education. 204 put that back, but left the function able to do
-- it again the next time anybody ran it.
--
-- So the rule is stated instead of patched around: somebody narrowed to
-- particular budget lines is a named representative, not a portfolio holder,
-- and holding the office does not quietly widen them. The narrow scope is a
-- decision somebody made; the wide one would be a side effect.

DROP FUNCTION IF EXISTS reconcile_office_ministries();

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
       AND NOT EXISTS (
         SELECT 1 FROM ministry_verifiers v
          WHERE v.active
            AND v.person_id = h.person_id
            AND cardinality(COALESCE(v.projects, ARRAY[]::TEXT[])) > 0
       )
  ), missing AS (
    SELECT DISTINCT i.addr, i.ministry
      FROM implied i
      JOIN user_roles u ON lower(u.email) = i.addr
     WHERE NOT (i.ministry = ANY (COALESCE(u.ministries, ARRAY[]::TEXT[])))
  ), agg AS (
    SELECT m.addr, array_agg(DISTINCT m.ministry) AS ministries
      FROM missing m GROUP BY m.addr
  ), applied AS (
    UPDATE user_roles u
       SET ministries = ARRAY(
             SELECT DISTINCT x
               FROM unnest(COALESCE(u.ministries, ARRAY[]::TEXT[]) || a.ministries) AS x
           ),
           updated_at = NOW()
      FROM agg a
     WHERE lower(u.email) = a.addr
    RETURNING u.email AS e, a.ministries AS added
  )
  SELECT ap.e::TEXT, array_to_string(ap.added, ', ')::TEXT FROM applied ap;
END;
$$;

GRANT EXECUTE ON FUNCTION reconcile_office_ministries() TO authenticated;

COMMENT ON FUNCTION reconcile_office_ministries() IS
  'Adds every portfolio implied by a current EXCO/PROJECT office holding to the holder''s account. Safe to re-run; never removes a ministry, and never widens somebody deliberately scoped to particular budget lines in ministry_verifiers. Covers the case where an office was filled before the account existed, which the AFTER INSERT trigger cannot.';

SELECT * FROM reconcile_office_ministries();
