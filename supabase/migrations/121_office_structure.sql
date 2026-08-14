-- 121: the register describes the church's structure, so the church has to be
-- able to change it.
--
-- Two things were fixed shapes in code that are not fixed shapes in a church.
--
-- First, the categories. 'CHURCH', 'EXCO', 'DEAN', 'APPOINTED', 'COMMITTEE'
-- and 'PROJECT' were a CHECK constraint, so inventing a new kind of body meant
-- a migration. They are now rows. The column stays TEXT and keeps its old
-- values, referencing the new table instead of a constraint — every query that
-- reads offices.kind carries on working, and adding a category is an INSERT.
--
-- Second, hierarchy. BAM is a committee *under* the Property portfolio, and the
-- register had no way to say "under". Without it a committee floats beside the
-- portfolio that owns it, which is both wrong on the page and useless for
-- deciding who answers for its spending.

-- ── Categories become data ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS office_categories (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Whether posts of this kind normally seat several people at once. The office
  -- form reads it so a new category behaves sensibly without being special-cased.
  seats_many  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Whether holding one of these is a seat on the EXCO. Kept explicit rather
  -- than inferred from the key, so a new category can say so for itself.
  is_exco     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 500,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The six that existed, with the wording the page already used for them.
INSERT INTO office_categories (key, label, description, seats_many, is_exco, sort_order) VALUES
  ('CHURCH',    'Church Offices', 'Elected constitutional posts',                                    FALSE, FALSE, 10),
  ('DEAN',      'Deans',          'One elected Dean per district — leave routing follows this',      FALSE, FALSE, 20),
  ('EXCO',      'EXCO Portfolios','One elected member per portfolio',                                FALSE, TRUE,  30),
  ('APPOINTED', 'Appointed Posts','Permanent appointments, not up for election',                     FALSE, FALSE, 40),
  ('COMMITTEE', 'Committees',     'Several members may serve at once — not EXCO posts',              TRUE,  FALSE, 50),
  ('PROJECT',   'Project & Supporting Committees',
                'Set up for a purpose or a period — they carry no EXCO seat',                        TRUE,  FALSE, 60)
ON CONFLICT (key) DO NOTHING;

-- Swap the constraint for a reference. Deliberately NOT ON DELETE CASCADE: a
-- category with posts in it should refuse to be deleted rather than take them
-- with it.
ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_kind_check;
ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_kind_fkey;
ALTER TABLE offices
  ADD CONSTRAINT offices_kind_fkey FOREIGN KEY (kind)
  REFERENCES office_categories(key) ON UPDATE CASCADE;

ALTER TABLE office_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oc_read"  ON office_categories;
DROP POLICY IF EXISTS "oc_write" ON office_categories;
CREATE POLICY "oc_read"  ON office_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "oc_write" ON office_categories FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());
GRANT SELECT, INSERT, UPDATE, DELETE ON office_categories TO authenticated;

-- ── Hierarchy ─────────────────────────────────────────────────────────────
-- A committee sits under the portfolio that owns it. Self-referencing, nullable,
-- and ON DELETE SET NULL: retiring a parent should orphan its children, not
-- delete them.
ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS parent_office_id UUID REFERENCES offices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offices_parent ON offices(parent_office_id);

-- A post cannot be its own parent. Deeper cycles are prevented in the form —
-- a CHECK cannot see beyond its own row.
ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_not_own_parent;
ALTER TABLE offices ADD CONSTRAINT offices_not_own_parent
  CHECK (parent_office_id IS NULL OR parent_office_id <> id);

COMMENT ON COLUMN offices.parent_office_id IS
  'The post this one sits under — a committee under the EXCO portfolio that owns it.';

-- ── The names, corrected ──────────────────────────────────────────────────
-- YAY is Young Adults & Youth. The register had the two words the wrong way
-- round, and vouchers carry a third spelling again ("Young Adult and Youth").
UPDATE offices    SET name = 'Young Adults & Youth (YAY)' WHERE name = 'YAY (Youth & Young Adults)';
UPDATE ministries SET name = 'Young Adults & Youth (YAY)' WHERE name = 'YAY (Youth & Young Adults)';

-- Property is the EXCO portfolio; BAM is the committee under it. Property was
-- missing entirely, which is why ten vouchers carry a ministry the register has
-- never heard of.
INSERT INTO ministries (name)
SELECT 'Property'
 WHERE NOT EXISTS (SELECT 1 FROM ministries WHERE name = 'Property');

INSERT INTO offices (name, kind, tenure, grants_role, single_holder, sort_order, active)
SELECT 'Property', 'EXCO', 'ELECTED', 'MINISTRY_HEAD', TRUE, 35, TRUE
 WHERE NOT EXISTS (SELECT 1 FROM offices WHERE name = 'Property');

UPDATE offices c
   SET parent_office_id = p.id
  FROM offices p
 WHERE p.name = 'Property'
   AND c.name = 'BAM Committee'
   AND c.parent_office_id IS NULL;
