-- 100: Elected offices, and who holds them now.
--
-- Bishop, Secretary, Treasurer and each EXCO portfolio are *posts*, not
-- qualities of a person. They are held for a term, by exactly one person at a
-- time, and they change hands at an election. Recording them as flags on a
-- person (is_exco, a free-text portfolio) could not express any of that: two
-- people could claim the same portfolio, and the moment someone new was
-- elected the fact that anyone held it before was lost.
--
-- So the office is the record and the person is the occupant. An election ends
-- one holding and begins another, which keeps the history for free — the
-- question "who was Treasurer in 2024" has an answer.

CREATE TABLE IF NOT EXISTS offices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  -- CHURCH  — Bishop, Secretary, Treasurer: the constitutional offices.
  -- EXCO    — one per portfolio, e.g. Mission, Stewardship, Social Concern.
  kind        TEXT NOT NULL DEFAULT 'EXCO' CHECK (kind IN ('CHURCH','EXCO')),
  -- The system role this office carries, so electing someone can move their
  -- access with them instead of it being set separately and drifting.
  grants_role TEXT,
  sort_order  INT NOT NULL DEFAULT 100,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office_holdings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id   UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  elected_on  DATE,
  term_start  DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Null means "still in office". Setting it is how a term ends.
  term_end    DATE,
  note        TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oh_office ON office_holdings(office_id);
CREATE INDEX IF NOT EXISTS idx_oh_person ON office_holdings(person_id);

-- One holder per office at a time. Enforced by the database rather than by the
-- page, because two people holding the Treasurer's post is not a display bug —
-- it would make approvals ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oh_one_current
  ON office_holdings(office_id) WHERE term_end IS NULL;

ALTER TABLE offices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_holdings  ENABLE ROW LEVEL SECURITY;

-- Who holds an office is not a secret — it decides who approves what, and
-- everyone benefits from seeing it. Only the directory keepers may change it.
DROP POLICY IF EXISTS "offices_read"  ON offices;
DROP POLICY IF EXISTS "offices_write" ON offices;
CREATE POLICY "offices_read"  ON offices FOR SELECT TO authenticated USING (true);
CREATE POLICY "offices_write" ON offices FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

DROP POLICY IF EXISTS "oh_read"  ON office_holdings;
DROP POLICY IF EXISTS "oh_write" ON office_holdings;
CREATE POLICY "oh_read"  ON office_holdings FOR SELECT TO authenticated USING (true);
CREATE POLICY "oh_write" ON office_holdings FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON offices         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON office_holdings TO authenticated;

-- ── The offices themselves ────────────────────────────────────────────────
INSERT INTO offices (name, kind, grants_role, sort_order) VALUES
  ('Bishop',           'CHURCH', 'BISHOP',          1),
  ('Secretary',        'CHURCH', 'SECRETARY',       2),
  ('Treasurer',        'CHURCH', 'TREASURER',       3),
  ('General Manager',  'CHURCH', 'GENERAL_MANAGER', 4)
ON CONFLICT (name) DO NOTHING;

-- One EXCO portfolio per standing committee. Offices, payee groupings and
-- finance functions are excluded — they are not committees anyone is elected to.
INSERT INTO offices (name, kind, grants_role, sort_order)
SELECT m.name, 'EXCO', 'MINISTRY_HEAD', 100
FROM ministries m
WHERE lower(trim(m.name)) NOT IN (
  'head quarters (hq)','head quarters','hq','finance and development','f & d',
  'finance & development','lcm congregation','bishop','bam','finance'
)
ON CONFLICT (name) DO NOTHING;

-- ── Carry across who holds what today ─────────────────────────────────────
-- The current Bishop, Secretary, Treasurer and GM come from their login role.
INSERT INTO office_holdings (office_id, person_id, term_start, note, created_by)
SELECT o.id, p.id, CURRENT_DATE, 'carried over from existing roles', 'migration 100'
FROM offices o
JOIN user_roles ur ON ur.role = o.grants_role
JOIN people p ON lower(p.user_email) = lower(ur.email)
WHERE o.kind = 'CHURCH'
  AND NOT EXISTS (
    SELECT 1 FROM office_holdings h WHERE h.office_id = o.id AND h.term_end IS NULL
  );

-- EXCO members hold the portfolio their account was assigned. Only the first
-- match per office is taken, since an office admits one holder.
INSERT INTO office_holdings (office_id, person_id, term_start, note, created_by)
SELECT DISTINCT ON (o.id) o.id, p.id, CURRENT_DATE, 'carried over from EXCO assignment', 'migration 100'
FROM offices o
JOIN user_roles ur ON ur.role = 'MINISTRY_HEAD' AND o.name = ANY(ur.ministries)
JOIN people p ON lower(p.user_email) = lower(ur.email)
WHERE o.kind = 'EXCO'
  AND NOT EXISTS (
    SELECT 1 FROM office_holdings h WHERE h.office_id = o.id AND h.term_end IS NULL
  )
ORDER BY o.id, ur.email;

-- The free-text portfolio on people is superseded by the holdings above.
COMMENT ON COLUMN people.exco_portfolio IS
  'Superseded by office_holdings — kept only for records seeded before migration 100';
