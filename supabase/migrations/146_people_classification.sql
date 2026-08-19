-- 146: classifying people properly, and the rules about who may hold what.
--
-- The directory has had one axis — a category, from HQ Staff to Vendor — and
-- that axis is wrong in both directions. It cannot say that somebody is a
-- Reverend rather than a Pastor, and it cannot hold two truths at once, though
-- a retired pastor on the HQ payroll sitting on a project committee is three.
--
-- So the category stays as "what they mainly are to LCM", and the facts that
-- decide eligibility become their own fields.

-- ── 1. Standing, for anyone in ministry ───────────────────────────────────
-- Ordination is not a status, it is a standing: a Pastor becomes a Reverend
-- and later retires, while remaining the same person on the same record.
--
-- Deliberately separate from people.status, which already has RETIRED. That
-- one means "no longer active in the directory". A retired pastor is very
-- often still active — on the HQ payroll, on a committee — and collapsing the
-- two would either hide them or claim they never retired.
ALTER TABLE people ADD COLUMN IF NOT EXISTS pastor_standing TEXT;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_pastor_standing_check;
ALTER TABLE people ADD CONSTRAINT people_pastor_standing_check
  CHECK (pastor_standing IS NULL OR pastor_standing IN ('PASTOR','REVEREND','RETIRED'));

COMMENT ON COLUMN people.pastor_standing IS
  'PASTOR (not yet ordained), REVEREND (ordained), RETIRED. Null for anyone not in ministry. Separate from status, which is about being active in the directory.';

-- ── 2. Which church they belong to ────────────────────────────────────────
-- Volunteers can stand for EXCO and for Treasurer, but only from an LCM
-- congregation, so "which church" stops being background and becomes the fact
-- the rule turns on.
--
-- Churches outside LCM get a table rather than a free-text box: the second
-- volunteer from the same church should pick the same row, not retype it into
-- a slightly different spelling that no longer groups.
CREATE TABLE IF NOT EXISTS external_churches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  town       TEXT,
  notes      TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT external_church_name_not_blank CHECK (length(trim(name)) > 0)
);

ALTER TABLE people ADD COLUMN IF NOT EXISTS affiliation TEXT;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_affiliation_check;
ALTER TABLE people ADD CONSTRAINT people_affiliation_check
  CHECK (affiliation IS NULL OR affiliation IN
         ('LCM_MEMBER','OTHER_CHURCH','NOT_CHRISTIAN','NOT_STATED'));

ALTER TABLE people ADD COLUMN IF NOT EXISTS congregation_id UUID
  REFERENCES congregations(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS external_church_id UUID
  REFERENCES external_churches(id) ON DELETE SET NULL;

COMMENT ON COLUMN people.affiliation IS
  'LCM_MEMBER (with congregation_id), OTHER_CHURCH (with external_church_id), NOT_CHRISTIAN, or NOT_STATED.';

-- ── 3. What a vendor or agent is actually for ─────────────────────────────
-- vendor_service already held a line of description. What was missing is how
-- to pay them, and which part of LCM they act for — the company secretary for
-- Seeds of Grace is not the company secretary for Highlands Lakeview, and the
-- record has to say which.
ALTER TABLE people ADD COLUMN IF NOT EXISTS bank_name       TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS bank_account_no TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS serves_entity   TEXT;

COMMENT ON COLUMN people.serves_entity IS
  'Which part of LCM this vendor or agent acts for, where it is not LCM as a whole.';

-- ── 4. Who may hold which post ────────────────────────────────────────────
-- The constitution restricts several posts, and until now nothing recorded
-- that: the election form offered all thirteen people for every post.
--
-- Returns NULL when somebody may stand, and a sentence when they may not. A
-- sentence rather than a boolean because the page has to say WHY somebody is
-- not on the list, or it looks broken.
--
-- Missing data is reported as missing rather than as ineligible. If nobody has
-- a standing recorded yet, saying "not a Reverend" of everyone would be a lie,
-- and an empty list with no explanation is the failure that looks exactly like
-- a bug.
CREATE OR REPLACE FUNCTION office_eligibility(p_office_id UUID, p_person_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o        offices%ROWTYPE;
  p        people%ROWTYPE;
  v_cong_district UUID;
BEGIN
  SELECT * INTO o FROM offices WHERE id = p_office_id;
  SELECT * INTO p FROM people  WHERE id = p_person_id;
  IF NOT FOUND OR o.id IS NULL THEN RETURN NULL; END IF;

  -- Bishop and Secretary: ordained only.
  IF o.grants_role IN ('BISHOP','SECRETARY') THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — this post is open to Reverends only';
    ELSIF p.pastor_standing = 'RETIRED' THEN
      RETURN 'Retired pastors cannot stand for this post';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN 'Open to Reverends only — not yet ordained';
    END IF;
    RETURN NULL;
  END IF;

  -- Treasurer: a lay leader from an LCM congregation.
  IF o.grants_role = 'TREASURER' THEN
    IF p.pastor_standing IS NOT NULL THEN
      RETURN 'Treasurer is a lay post — open to volunteers, not to ministry';
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No church affiliation recorded — this post is open to LCM members only';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to members of an LCM congregation only';
    END IF;
    RETURN NULL;
  END IF;

  -- A Dean: a Reverend serving in that district.
  IF o.kind = 'DEAN' THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — a Dean must be a Reverend';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN CASE WHEN p.pastor_standing = 'RETIRED'
                  THEN 'Retired pastors cannot serve as Dean'
                  ELSE 'A Dean must be a Reverend' END;
    END IF;
    SELECT c.district_id INTO v_cong_district
      FROM congregations c WHERE c.id = p.congregation_id;
    IF v_cong_district IS NULL THEN
      RETURN 'No LCM congregation recorded — a Dean comes from a church in the district';
    ELSIF o.district_id IS NOT NULL AND v_cong_district <> o.district_id THEN
      RETURN 'Serves a congregation in another district';
    END IF;
    RETURN NULL;
  END IF;

  -- An EXCO seat: ministry or an LCM lay member, and never a retired pastor.
  IF o.kind = 'EXCO' THEN
    IF p.pastor_standing = 'RETIRED' THEN
      RETURN 'Retired pastors cannot hold an EXCO portfolio';
    ELSIF p.pastor_standing IS NOT NULL THEN
      RETURN NULL;                       -- a serving Pastor or Reverend may stand
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No standing or church affiliation recorded — EXCO is open to ministry and to LCM members';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to ministry and to members of an LCM congregation';
    END IF;
    RETURN NULL;
  END IF;

  -- Everything else — committees, projects, HQ staff posts — is unrestricted.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION office_eligibility(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION office_eligibility(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION office_eligibility(UUID, UUID) IS
  'Null if this person may hold this post, otherwise the reason they may not. One definition, so the picker and any later server-side check cannot disagree.';

-- ── 5. Who to speak to at a partner organisation ──────────────────────────
-- organisations carried a single contact_name, which cannot express the thing
-- that actually matters about LCA, LSC, CCM, ELCA or LEM: who is authorised to
-- decide, and who is the person you actually correspond with day to day.
CREATE TABLE IF NOT EXISTS organisation_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  role            TEXT NOT NULL DEFAULT 'CONTACT'
                    CHECK (role IN ('SIGNATORY','PIC','CONTACT','SUPPORT')),
  name            TEXT NOT NULL,
  position        TEXT,
  email           TEXT,
  phone           TEXT,
  notes           TEXT,
  sort_order      INT NOT NULL DEFAULT 500,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT org_contact_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_org_contact ON organisation_contacts (organisation_id, sort_order);

COMMENT ON TABLE organisation_contacts IS
  'People at a partner organisation. SIGNATORY authorises, PIC decides, CONTACT and SUPPORT are who you write to.';

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE external_churches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_contacts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extchurch_read"  ON external_churches;
DROP POLICY IF EXISTS "extchurch_write" ON external_churches;
DROP POLICY IF EXISTS "orgcontact_read"  ON organisation_contacts;
DROP POLICY IF EXISTS "orgcontact_write" ON organisation_contacts;

-- Readable by anyone signed in: a church name is a lookup, and the form that
-- offers it has to be able to load it.
CREATE POLICY "extchurch_read" ON external_churches FOR SELECT TO authenticated USING (true);
CREATE POLICY "extchurch_write" ON external_churches FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

CREATE POLICY "orgcontact_read" ON organisation_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "orgcontact_write" ON organisation_contacts FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON external_churches     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_contacts TO authenticated;

-- ── Backfill what can be inferred ─────────────────────────────────────────
-- Anybody already filed as a Pastor is at least a Pastor. Which of them are
-- ordained is not recorded anywhere, so it is left blank rather than guessed —
-- a wrong Reverend would make somebody eligible to stand as Bishop.
UPDATE people SET pastor_standing = 'PASTOR'
 WHERE category = 'PASTOR' AND pastor_standing IS NULL;
