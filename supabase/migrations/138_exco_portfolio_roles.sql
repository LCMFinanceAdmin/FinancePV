-- 138: each EXCO portfolio becomes its own role.
--
-- Until now every EXCO member held MINISTRY_HEAD and the portfolio lived beside
-- it in user_roles.ministries. That is why the app could only ever say "EXCO
-- Member" and then tack the portfolio on. The register, the People directory
-- and every voucher now say what somebody actually holds: EXCO — Education.
--
-- ── Why this is safe to add before anything uses it ───────────────────────
-- Adding role keys grants nothing on its own (see 126). Nothing moves onto
-- them until the offices are pointed at them, which happens last, after the
-- code that reads roles has been taught the family. Until then MINISTRY_HEAD
-- keeps working exactly as before, and it keeps working afterwards too — it
-- stays a valid role for an EXCO member with no portfolio recorded yet.
--
-- ── The family ────────────────────────────────────────────────────────────
-- MINISTRY_HEAD and every EXCO_* key are one family. Everything that used to
-- ask "is this person an EXCO member" asks is_exco_role() instead, so there is
-- one definition of the answer rather than one per call site. This is what
-- keeps eight new keys from becoming eight new ways to be silently locked out.

CREATE OR REPLACE FUNCTION exco_role_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  -- A portfolio written "Young Adults & Youth (YAY)" becomes EXCO_YAY: the
  -- acronym is what people say out loud, and a key built from the long form
  -- would be unreadable in a policy or an audit line.
  SELECT 'EXCO_' || CASE
    WHEN p_name ~ '\(([A-Za-z]{2,10})\)\s*$'
      THEN upper((regexp_match(p_name, '\(([A-Za-z]{2,10})\)\s*$'))[1])
    ELSE regexp_replace(upper(btrim(p_name)), '[^A-Z0-9]+', '_', 'g')
  END;
$$;

COMMENT ON FUNCTION exco_role_key(TEXT) IS
  'Portfolio name -> role key. Used by the migration and by the offices page, so a new portfolio names its role the same way.';

-- One role per active portfolio, described so the picker explains itself.
INSERT INTO app_roles (key, label, description, assignable, is_system, sort_order)
SELECT exco_role_key(o.name),
       'EXCO — ' || regexp_replace(o.name, '\s*\([A-Za-z]{2,10}\)\s*$', ''),
       'Verifies ' || o.name || ' spending against its budget. One holder at a time.',
       TRUE, TRUE,
       90 + row_number() OVER (ORDER BY o.sort_order, o.name)
  FROM offices o
 WHERE o.kind = 'EXCO' AND o.active
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description;

-- The generic key stays, and stays assignable: an EXCO member whose portfolio
-- is not recorded yet is still an EXCO member, and demoting them to nothing
-- while the register is filled in would be the wrong failure.
UPDATE app_roles
   SET label = 'EXCO Member — no portfolio',
       description = 'An EXCO seat with no portfolio recorded. Prefer the named portfolio roles.',
       sort_order = 89
 WHERE key = 'MINISTRY_HEAD';

-- ── The family test ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_exco_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_role = 'MINISTRY_HEAD' OR p_role LIKE 'EXCO/_%' ESCAPE '/';
$$;

COMMENT ON FUNCTION is_exco_role(TEXT) IS
  'Whether a role is an EXCO seat — the generic one or any named portfolio. One definition, so a new portfolio cannot be missed by a call site.';

REVOKE ALL ON FUNCTION exco_role_key(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_exco_role(TEXT)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION exco_role_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_exco_role(TEXT)  TO authenticated;

-- ── How long a term runs ──────────────────────────────────────────────────
-- The constitution sets these, not the person recording an election: four
-- years for the Bishop, two for everyone else who stands. Held on the post so
-- the end date fills itself in and nobody has to remember which is which.
ALTER TABLE offices ADD COLUMN IF NOT EXISTS term_years INT;
ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_term_years_sane;
ALTER TABLE offices ADD CONSTRAINT offices_term_years_sane
  CHECK (term_years IS NULL OR (term_years BETWEEN 1 AND 20));

COMMENT ON COLUMN offices.term_years IS
  'Length of one term, in years. Fills in the expected end date when a term is recorded. Null for posts that are not held for a fixed term.';

UPDATE offices SET term_years = 4 WHERE lower(name) = 'bishop';
UPDATE offices SET term_years = 2
 WHERE term_years IS NULL
   AND (kind = 'EXCO' OR lower(name) IN ('secretary','treasurer'));

-- ── Who may seat several people ───────────────────────────────────────────
-- Elected posts seat one. Committees and supporting ministries seat as many as
-- they need. Held on the category so the form stops asking a question whose
-- answer is already known.
UPDATE office_categories SET seats_many = FALSE WHERE key IN ('CHURCH','EXCO','DEAN');
UPDATE office_categories SET seats_many = TRUE  WHERE key IN ('COMMITTEE','PROJECT');

-- ── Naming ────────────────────────────────────────────────────────────────
UPDATE office_categories
   SET label = 'HQ Staff Posts',
       description = 'Salaried posts at HQ — held by employment rather than election'
 WHERE key = 'APPOINTED';
