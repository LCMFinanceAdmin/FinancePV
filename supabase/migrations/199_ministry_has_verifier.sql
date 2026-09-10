-- 199: is there anybody at all who could verify for this ministry?
--
-- Twelve of the fourteen ministries currently have nobody. A payment request
-- booked to one of them stops at SUBMITTED, never becomes a GM Claim, and so
-- never reaches Finance — it is not rejected, it simply never arrives.
-- PR-2026-002 has been sitting there.
--
-- The General Manager may now approve such a request directly, and this answers
-- the question that decides whether he may. A ministry with a verifier still
-- goes through them; only an empty seat lets the step be skipped. Without the
-- check the bypass would be a general power to skip verification rather than a
-- way to cope with a vacancy.
--
-- Takes an array rather than a name because Education and Education Desk are
-- one committee in both directions, and those parent/child links are already
-- declared in two places — lib/ministries.ts and the edge functions' shared
-- copy, with a comment asking that they be kept in step. A third copy in SQL
-- would be a third thing to keep in step. The caller expands the family; this
-- answers only "does anybody cover any of these".
--
-- Mirrors is_delegated_verifier's joins, minus the email filter: an
-- office-held delegation counts only while somebody actually holds the office,
-- and any delegation counts only inside its dates.

CREATE OR REPLACE FUNCTION ministry_has_verifier(p_ministries TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Somebody holding the portfolio outright.
    EXISTS (
      SELECT 1 FROM user_roles u
       WHERE EXISTS (
         SELECT 1 FROM unnest(COALESCE(u.ministries, ARRAY[]::TEXT[])) m
          WHERE lower(m) = ANY (SELECT lower(x) FROM unnest(p_ministries) x)
       )
    )
    -- Or a representative named for it, in date, and an actual person today.
    OR EXISTS (
      SELECT 1
        FROM ministry_verifiers v
        LEFT JOIN people p ON p.id = v.person_id
        LEFT JOIN office_holdings h ON h.office_id = v.office_id AND h.term_end IS NULL
       WHERE v.active
         AND lower(v.ministry) = ANY (SELECT lower(x) FROM unnest(p_ministries) x)
         AND (v.starts_on IS NULL OR v.starts_on <= CURRENT_DATE)
         AND (v.ends_on   IS NULL OR v.ends_on   >= CURRENT_DATE)
         AND (p.id IS NOT NULL OR h.person_id IS NOT NULL)
    );
$$;

GRANT EXECUTE ON FUNCTION ministry_has_verifier(TEXT[]) TO authenticated;

COMMENT ON FUNCTION ministry_has_verifier(TEXT[]) IS
  'Whether anybody could verify for any of these ministries - a portfolio holder or a named representative. Pass the whole family (Education with Education Desk); the caller expands it.';

SELECT m.name, ministry_has_verifier(ARRAY[m.name]) AS has_verifier
  FROM ministries m ORDER BY 2 DESC, m.name;
