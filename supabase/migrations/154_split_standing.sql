-- 154: ordination and retirement are two facts, not one.
--
-- pastor_standing held four values — PASTOR, REVEREND, RETIRED_WORKING,
-- RETIRED — which forced one column to answer two unrelated questions: whether
-- somebody is ordained, and whether they are still serving. The two are
-- independent, and collapsing them loses the first: a Reverend who retires
-- becomes RETIRED and stops being a Reverend as far as the record is concerned.
--
-- Ordination does not lapse. Rev Chan Mun Kwan is retired and still Rev, and
-- the only place that survived was his preferred name, typed by hand as
-- "Rev Chan" — a title held in a nickname field is a title the app cannot use.
--
-- So: ordination is what somebody IS and does not change; ministry_status is
-- what they are DOING now and does.

ALTER TABLE people ADD COLUMN IF NOT EXISTS ordination      TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS ministry_status TEXT;

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_ordination_check;
ALTER TABLE people ADD CONSTRAINT people_ordination_check
  CHECK (ordination IS NULL OR ordination IN ('PASTOR','REVEREND'));

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_ministry_status_check;
ALTER TABLE people ADD CONSTRAINT people_ministry_status_check
  CHECK (ministry_status IS NULL OR ministry_status IN ('ACTIVE','RETIRED_CONTRACT','RETIRED'));

COMMENT ON COLUMN people.ordination IS
  'PASTOR (unordained) or REVEREND (ordained). Permanent — retirement does not revoke it. Null means not in ministry, or not recorded yet.';
COMMENT ON COLUMN people.ministry_status IS
  'ACTIVE, RETIRED_CONTRACT (retired but still working under contract) or RETIRED. Null means not in ministry.';

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Status carries over cleanly; every old value says exactly one thing about it.
UPDATE people SET ministry_status =
  CASE pastor_standing
    WHEN 'PASTOR'          THEN 'ACTIVE'
    WHEN 'REVEREND'        THEN 'ACTIVE'
    WHEN 'RETIRED_WORKING' THEN 'RETIRED_CONTRACT'
    WHEN 'RETIRED'         THEN 'RETIRED'
  END
WHERE ministry_status IS NULL AND pastor_standing IS NOT NULL;

UPDATE people SET ordination = pastor_standing
 WHERE ordination IS NULL AND pastor_standing IN ('PASTOR','REVEREND');

-- The retired rows are the ones the old shape destroyed: RETIRED_WORKING and
-- RETIRED say nothing about ordination. Where somebody was titled by hand the
-- title is recoverable, and that hand-typed name is the only evidence there is.
-- Anything left null is honestly unknown, and office_eligibility says so rather
-- than guessing.
UPDATE people SET ordination = 'REVEREND'
 WHERE ordination IS NULL
   AND pastor_standing IN ('RETIRED_WORKING','RETIRED')
   AND (COALESCE(preferred_name,'') ~* '(^|[^a-z])rev[.]?([^a-z]|$)'
     OR COALESCE(full_name,'')      ~* '(^|[^a-z])rev[.]?([^a-z]|$)');

-- ── Retirement, asked of the new column ───────────────────────────────────
CREATE OR REPLACE FUNCTION is_retired_ministry(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_status IN ('RETIRED','RETIRED_CONTRACT'); $$;

REVOKE ALL ON FUNCTION is_retired_ministry(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_retired_ministry(TEXT) TO authenticated;

-- ── Eligibility, on the two facts ─────────────────────────────────────────
-- "In ministry" is now ministry_status IS NOT NULL rather than
-- pastor_standing IS NOT NULL. That distinction matters to the Treasurer,
-- which is a lay post: somebody ordained but retired is still ministry, and
-- still barred from it.
CREATE OR REPLACE FUNCTION office_eligibility(p_office_id UUID, p_person_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o offices%ROWTYPE;
  p people%ROWTYPE;
  v_districts UUID[];
BEGIN
  SELECT * INTO o FROM offices WHERE id = p_office_id;
  SELECT * INTO p FROM people  WHERE id = p_person_id;
  IF NOT FOUND OR o.id IS NULL THEN RETURN NULL; END IF;

  IF o.grants_role IN ('BISHOP','SECRETARY') THEN
    IF p.ministry_status IS NULL THEN
      RETURN 'No standing recorded — this post is open to Reverends only';
    ELSIF is_retired_ministry(p.ministry_status) THEN
      RETURN 'Retired pastors cannot stand for this post';
    ELSIF p.ordination IS NULL THEN
      RETURN 'No ordination recorded — this post is open to Reverends only';
    ELSIF p.ordination <> 'REVEREND' THEN
      RETURN 'Open to Reverends only — not yet ordained';
    END IF;
    RETURN NULL;
  END IF;

  IF o.grants_role = 'TREASURER' THEN
    IF p.ministry_status IS NOT NULL THEN
      RETURN 'Treasurer is a lay post — open to volunteers, not to ministry';
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No church affiliation recorded — this post is open to LCM members only';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to members of an LCM congregation only';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'DEAN' THEN
    IF p.ministry_status IS NULL THEN
      RETURN 'No standing recorded — a Dean must be a Reverend';
    ELSIF is_retired_ministry(p.ministry_status) THEN
      RETURN 'Retired pastors cannot serve as Dean';
    ELSIF p.ordination IS NULL THEN
      RETURN 'No ordination recorded — a Dean must be a Reverend';
    ELSIF p.ordination <> 'REVEREND' THEN
      RETURN 'A Dean must be a Reverend';
    ELSIF p.posting = 'HQ' THEN
      RETURN 'Posted to HQ — a Dean serves a congregation in the district';
    END IF;

    SELECT array_agg(DISTINCT c.district_id) INTO v_districts
      FROM congregations c
     WHERE c.district_id IS NOT NULL
       AND (
            c.id = p.congregation_id
         OR (
              COALESCE(NULLIF(btrim(p.user_email), ''), NULLIF(btrim(p.email), '')) IS NOT NULL
              AND lower(btrim(c.head_pastor_email)) =
                  lower(COALESCE(NULLIF(btrim(p.user_email), ''), NULLIF(btrim(p.email), '')))
            )
       );

    IF v_districts IS NULL OR array_length(v_districts, 1) IS NULL THEN
      RETURN 'No LCM congregation recorded — a Dean serves, or belongs to, a church in the district';
    ELSIF o.district_id IS NOT NULL AND NOT (o.district_id = ANY(v_districts)) THEN
      RETURN 'Their congregation is in another district';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'EXCO' THEN
    IF is_retired_ministry(p.ministry_status) THEN
      RETURN 'Retired pastors cannot hold an EXCO portfolio';
    ELSIF p.ministry_status IS NOT NULL THEN
      RETURN NULL;
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No standing or church affiliation recorded — EXCO is open to ministry and to LCM members';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to ministry and to members of an LCM congregation';
    END IF;
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION office_eligibility(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION office_eligibility(UUID, UUID) TO authenticated;

-- ── The old shape goes ────────────────────────────────────────────────────
-- Dropped rather than left behind. The profile form saves by spreading every
-- column it read, so a column still present is a column still written — two
-- records of the same fact, drifting apart the first time one is edited.
DROP FUNCTION IF EXISTS is_retired_standing(TEXT);
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_pastor_standing_check;
ALTER TABLE people DROP COLUMN IF EXISTS pastor_standing;
