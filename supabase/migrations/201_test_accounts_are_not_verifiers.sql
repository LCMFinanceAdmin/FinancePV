-- 201: a test account is not a member of anybody's committee.
--
-- Settings has a switch for marking an account as a test fixture, and two are
-- so marked. One of them, "Test EXCO Education", carries MINISTRY_HEAD and the
-- Education portfolio — created 17 August, never signed in, at a domain that
-- does not resolve.
--
-- It has been answering for Education ever since. Two consequences, both bad:
--
--   1. ministry_has_verifier says Education is staffed, so 199's escape hatch
--      refuses the General Manager the direct approval of an Education request
--      on the grounds that somebody else will handle it. Nobody will.
--   2. Every Education notification is addressed to unset.invalid and goes
--      nowhere, while the sender is told the committee was notified.
--
-- The row is not deleted. It is a deliberate fixture and somebody is presumably
-- using it to exercise the EXCO path; the mistake was letting a fixture answer
-- a question about who really holds a portfolio. So the question gets more
-- precise instead.

CREATE OR REPLACE FUNCTION ministry_has_verifier(
  p_ministries TEXT[],
  p_project    TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- A portfolio holder covers everything their committee books — unless the
    -- holder is a test fixture, which covers nothing.
    EXISTS (
      SELECT 1 FROM user_roles u
       WHERE NOT COALESCE(u.is_test_account, FALSE)
         AND EXISTS (
           SELECT 1 FROM unnest(COALESCE(u.ministries, ARRAY[]::TEXT[])) m
            WHERE lower(m) = ANY (SELECT lower(x) FROM unnest(p_ministries) x)
         )
    )
    -- A named representative covers the whole ministry, or only the budget
    -- lines they were given.
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
         AND (
           p_project IS NULL
           OR cardinality(COALESCE(v.projects, ARRAY[]::TEXT[])) = 0
           OR p_project = ANY (v.projects)
         )
    );
$$;

COMMENT ON FUNCTION ministry_has_verifier(TEXT[], TEXT) IS
  'Whether anybody could really verify for these ministries, and for this budget line if one is named. Test accounts do not count. Pass the whole family; the caller expands it.';

SELECT ministry_has_verifier(ARRAY['Education','Education Desk'], 'Education Desk Project') AS edu_chans_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'], 'Lay Leaders Training')   AS edu_other_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'])                           AS edu_overall,
       ministry_has_verifier(ARRAY['Stewardship'])                                          AS stewardship,
       ministry_has_verifier(ARRAY['Mission'])                                              AS mission;
