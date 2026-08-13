-- 112: A person's history, not just their present.
--
-- The directory records what somebody is. It cannot record what they were.
-- Andrew moved from LCM KL to LCM PJ in 2019 and the KL membership is simply
-- gone; a parish worker who became HQ staff has one row saying HQ staff. For a
-- church that has existed for decades and whose people move between
-- congregations, ministries and posts, that is the wrong shape — the question
-- the office actually gets asked is "what has this person done with us", and
-- the answer was unavailable.
--
-- Four changes and a view. Nothing is duplicated: offices stay in
-- office_holdings, employment stays in payroll, and the view assembles them.

-- ── 1. Congregation membership becomes a period ───────────────────────────
ALTER TABLE person_congregations
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE,
  -- "Member", "Elder", "Sunday School Teacher" — what they are *there*, which
  -- is not the same as their category in the directory.
  ADD COLUMN IF NOT EXISTS role       TEXT;

-- The old constraint said a person could belong to a congregation once, ever.
-- People leave and come back; a family returns after years in another state.
-- What must not happen is two *open* memberships of the same church at once.
-- Found by what it constrains rather than by name: it was declared inline in
-- migration 099, and guessing the generated name wrong would leave it in place
-- and the whole point of this migration silently unavailable.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'person_congregations'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%person_id%congregation_id%'
  LOOP
    EXECUTE format('ALTER TABLE person_congregations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_one_current
  ON person_congregations (person_id, congregation_id)
  WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_pc_dates ON person_congregations (person_id, start_date DESC);

-- ── 2. The service that is not an office ──────────────────────────────────
-- Elected and appointed posts live in office_holdings and stay there. This is
-- for everything else a person does: the worship team, the AV rota, being the
-- contact at a supplier. Making each of those an "office" would mean a formal
-- register entry for helping with the projector.
CREATE TABLE IF NOT EXISTS person_involvements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  kind       TEXT NOT NULL DEFAULT 'MINISTRY'
               CHECK (kind IN ('MINISTRY','TEAM','VOLUNTEER','VENDOR','AGENT','PARTNER','OTHER')),
  -- What it is called: "Worship Team", "ABC Event Florist".
  title      TEXT NOT NULL,
  -- What they do in it: "Volunteer", "Coordinator", "Contact".
  role       TEXT,

  -- When the thing has a record of its own, point at it rather than retyping
  -- the name — a supplier's address belongs to the supplier.
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  congregation_id UUID REFERENCES congregations(id) ON DELETE SET NULL,

  start_date DATE,
  end_date   DATE,
  notes      TEXT,

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_person  ON person_involvements (person_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_pi_kind    ON person_involvements (kind);
CREATE INDEX IF NOT EXISTS idx_pi_org     ON person_involvements (organisation_id);
CREATE INDEX IF NOT EXISTS idx_pi_current ON person_involvements (person_id) WHERE end_date IS NULL;

-- ── 3. A face and a sentence ──────────────────────────────────────────────
-- photo_path is a key in the existing person-docs bucket, not a URL: the
-- bucket is private and served through signed links, and a stored URL would
-- expire. bio is the human sentence — "helps with AV" — and is deliberately
-- separate from the administrative notes below.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS bio        TEXT;

-- ── 4. Notes that say who and when ────────────────────────────────────────
-- people.notes was one text box. Two people editing it overwrote each other,
-- and nothing recorded who wrote what or when — which is most of the value of
-- a note about a person.
CREATE TABLE IF NOT EXISTS person_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  tag          TEXT CHECK (tag IN ('ADMIN','MEMBERSHIP','EMPLOYMENT','VENDOR','PASTORAL','GENERAL')),
  author_email TEXT,
  author_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pn_person ON person_notes (person_id, created_at DESC);

-- Carry the existing free-text note across as the first entry, so nothing is
-- lost and the old column can stop being written to.
INSERT INTO person_notes (person_id, body, tag, author_name, created_at)
SELECT p.id, p.notes, 'GENERAL', 'carried over from the person record', p.created_at
FROM people p
WHERE COALESCE(TRIM(p.notes), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM person_notes n WHERE n.person_id = p.id);

-- ── Who may read and write ────────────────────────────────────────────────
-- The same gate as the directory itself: this is all personal data about the
-- same people, and splitting the rule would be a way for the two to disagree.
ALTER TABLE person_involvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_notes        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pi_read"  ON person_involvements;
DROP POLICY IF EXISTS "pi_write" ON person_involvements;
CREATE POLICY "pi_read"  ON person_involvements FOR SELECT TO authenticated
  USING (can_manage_people() OR EXISTS (
    SELECT 1 FROM people p WHERE p.id = person_involvements.person_id
      AND lower(p.user_email) = lower(auth.jwt() ->> 'email')));
CREATE POLICY "pi_write" ON person_involvements FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

-- Notes are about a person, not for them: an administrative remark is not
-- something the subject reads. Keepers only, both ways.
DROP POLICY IF EXISTS "pn_read"  ON person_notes;
DROP POLICY IF EXISTS "pn_write" ON person_notes;
CREATE POLICY "pn_read"  ON person_notes FOR SELECT TO authenticated
  USING (can_manage_people());
CREATE POLICY "pn_write" ON person_notes FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON person_involvements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON person_notes        TO authenticated;

-- ── The timeline ──────────────────────────────────────────────────────────
-- One dated stream from four sources, each still owned by its own module. The
-- profile reads this; every row carries `source` so the page can link back to
-- the module that owns it and refuse to edit it in the wrong place.
--
-- security_invoker matters here. Without it a view runs as its owner and would
-- hand employment rows to anyone who could read the view — straight past the
-- payroll policies migration 108 just put in. With it, each source is filtered
-- by the reader's own rights, so someone without payroll access simply sees
-- the timeline minus the employment.
CREATE OR REPLACE VIEW person_timeline
WITH (security_invoker = true) AS

  -- Elected and appointed posts. Authoritative: Offices & Elections owns these.
  SELECT h.person_id,
         'OFFICE'::TEXT           AS source,
         o.kind                   AS kind,
         o.name                   AS title,
         COALESCE(h.note, 'Holder') AS role,
         h.term_start             AS start_date,
         h.term_end               AS end_date,
         h.id                     AS source_id,
         NULL::UUID               AS organisation_id
    FROM office_holdings h
    JOIN offices o ON o.id = h.office_id

  UNION ALL

  -- Congregation membership.
  SELECT pc.person_id,
         'CONGREGATION'::TEXT,
         'CONGREGATION',
         c.name,
         COALESCE(pc.role, 'Member'),
         pc.start_date,
         pc.end_date,
         pc.id,
         NULL::UUID
    FROM person_congregations pc
    JOIN congregations c ON c.id = pc.congregation_id

  UNION ALL

  -- Ministries, teams, vendor and agent relationships.
  SELECT pi.person_id,
         'INVOLVEMENT'::TEXT,
         pi.kind,
         pi.title,
         COALESCE(pi.role, ''),
         pi.start_date,
         pi.end_date,
         pi.id,
         pi.organisation_id
    FROM person_involvements pi

  UNION ALL

  -- Employment. Read from payroll, never copied — and withheld entirely from
  -- anyone the payroll policies withhold it from.
  SELECT p.id,
         'EMPLOYMENT'::TEXT,
         'EMPLOYMENT',
         COALESCE(NULLIF(pe.designation, ''), 'Employed by LCM'),
         COALESCE(NULLIF(pe.department, ''), NULLIF(pe.church_name, ''), ''),
         pe.date_commenced,
         pe.resigned_date,
         pe.id,
         NULL::UUID
    FROM people p
    JOIN payroll_employees pe ON pe.id = p.payroll_employee_id;

GRANT SELECT ON person_timeline TO authenticated;

COMMENT ON VIEW person_timeline IS
  'Everything a person has done with LCM, from the four modules that own it. security_invoker, so payroll rights still apply.';
COMMENT ON TABLE person_involvements IS
  'Ministries, teams and external relationships. Elected and appointed posts belong to office_holdings.';
