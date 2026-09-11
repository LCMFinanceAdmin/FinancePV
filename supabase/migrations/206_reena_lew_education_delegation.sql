-- 206: give Reena Lew the authority the Education Desk actually carries.
--
-- Three files spent on this because two rules in the schema disagree, and the
-- disagreement is silent.
--
-- 197 derives a portfolio from any EXCO or PROJECT office holding. But a
-- PROJECT office grants MINISTRY_SUPPORT, and 198's trigger clears ministries
-- on any MINISTRY_SUPPORT account on every write. So 197's PROJECT branch has
-- never once had an effect: it computes the portfolio, writes it, and the
-- trigger wipes it in the same statement. That is why recording Reena Lew's
-- holding appeared to work and changed nothing, twice.
--
-- 198 is the rule that should win, and it is the more considered of the two: a
-- desk representative is not a portfolio holder. Their authority is a named
-- delegation in ministry_verifiers, which can be scoped to particular budget
-- lines and withdrawn without touching their account.
--
-- So Reena Lew gets a delegation, which is what Chan Mun Kwan has. Hers is
-- unscoped: he was narrowed to the single Education Desk Project line by 198,
-- whereas she holds the desk itself, and Education's other lines — Lay Leaders
-- Training among them — presently have nobody at all.

INSERT INTO ministry_verifiers (person_id, ministry, projects, active, starts_on)
SELECT p.id, 'Education', ARRAY[]::TEXT[], TRUE, CURRENT_DATE
  FROM people p
 WHERE p.full_name = 'Lew Nyak Jin (Reena)'
   AND NOT EXISTS (
     SELECT 1 FROM ministry_verifiers v
      WHERE v.person_id = p.id AND lower(v.ministry) = 'education' AND v.active);

-- And stop the reconciler reporting work it cannot do. A MINISTRY_SUPPORT
-- account's ministries are cleared on write, so offering to add one is a lie
-- told once per run.
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

COMMENT ON FUNCTION reconcile_office_ministries() IS
  'Adds every portfolio implied by a current EXCO office holding to the holder''s account. Safe to re-run; never removes a ministry, never widens somebody scoped to particular budget lines, and skips MINISTRY_SUPPORT accounts, whose ministries are cleared on write by design — their authority is a ministry_verifiers delegation instead.';

SELECT (SELECT count(*) FROM reconcile_office_ministries())                                  AS reconciler_still_claims,
       is_delegated_verifier('reena.lew@lcm.org.my','Education','Lay Leaders Training')      AS reena_other_line,
       is_delegated_verifier('reena.lew@lcm.org.my','Education','Education Desk Project')    AS reena_desk_line,
       is_delegated_verifier('educationdesk@lcm.org.my','Education','Education Desk Project') AS chan_his_line,
       is_delegated_verifier('educationdesk@lcm.org.my','Education','Lay Leaders Training')   AS chan_other_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'],'Lay Leaders Training')      AS edu_other_line,
       ministry_has_verifier(ARRAY['Stewardship'])                                            AS stewardship,
       ministry_has_verifier(ARRAY['Mission'])                                                AS mission;
