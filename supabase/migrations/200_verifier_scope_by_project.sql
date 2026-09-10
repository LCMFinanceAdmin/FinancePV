-- 200: a verifier scoped to one budget line is not a verifier for the others.
--
-- 199 asked "does anybody cover this ministry" and stopped there. Education
-- shows why that is not the question. Its only verifier is Chan Mun Kwan, whose
-- delegation 198 narrowed to a single budget line — Education Desk Project. Ask
-- 199 about Education and it says yes.
--
-- So a request booked to Education on any other line, Lay Leaders Training say,
-- lands in the worst of both worlds: nobody can verify it, and because the
-- ministry "has a verifier" the General Manager is refused the direct approval
-- that 199 exists to provide. Stuck, and stuck by the very check meant to stop
-- things being stuck.
--
-- Proven before fixing:
--   Education / Education Desk Project   Chan can verify = true,  199 said true
--   Education / Lay Leaders Training     Chan can verify = false, 199 said true
--
-- The project now goes in, and the rule matches is_delegated_verifier exactly:
-- a portfolio holder covers everything their committee books, a named
-- representative covers only what they were given. Passing no project asks the
-- looser question — is there anybody at all — which is right for a screen
-- listing which ministries are staffed, and wrong for deciding one request.
--
-- Dropped rather than replaced. CREATE OR REPLACE with a new signature makes a
-- second function rather than replacing the first, and both then answer to the
-- same name depending on how they are called — which is how the database ended
-- up carrying two next_emp_no for a day. One-argument calls still work: they
-- resolve to this one through the default.

DROP FUNCTION IF EXISTS ministry_has_verifier(TEXT[]);

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
    -- A portfolio holder covers everything their committee books.
    EXISTS (
      SELECT 1 FROM user_roles u
       WHERE EXISTS (
         SELECT 1 FROM unnest(COALESCE(u.ministries, ARRAY[]::TEXT[])) m
          WHERE lower(m) = ANY (SELECT lower(x) FROM unnest(p_ministries) x)
       )
    )
    -- A named representative covers the whole ministry, or only the lines they
    -- were given. When no project is named the question is the looser one, so
    -- any live delegation counts.
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

GRANT EXECUTE ON FUNCTION ministry_has_verifier(TEXT[], TEXT) TO authenticated;

COMMENT ON FUNCTION ministry_has_verifier(TEXT[], TEXT) IS
  'Whether anybody could verify for these ministries, and for this budget line if one is named. Pass the whole family; the caller expands it. Omitting the project asks whether anybody covers the ministry at all.';

SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='ministry_has_verifier')     AS versions,
       ministry_has_verifier(ARRAY['Education','Education Desk'], 'Education Desk Project') AS scoped_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'], 'Lay Leaders Training')   AS other_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'])                            AS ministry_overall;
