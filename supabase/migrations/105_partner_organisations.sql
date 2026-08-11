-- 105: Partner and associate organisations.
--
-- LCM deals with bodies that are neither customers nor vendors: the Luther
-- Study Centre, the Trustees of the Lutheran Church in Malaysia Registered,
-- Highlands Lakeview Enterprises Sdn Bhd, Seeds of Grace Foundation, and the
-- overseas churches that support the work — ELCA, LCA, ELCB.
--
-- They were unrecordable. `people` describes individuals, and calling the ELCA
-- a vendor would be both wrong and misleading in the accounts. So an
-- organisation is its own record, and the person you actually speak to at one
-- stays in the people directory, linked to it.
--
-- The list below is a starting point, not a fixed set — organisations are added
-- on the page like anything else.

CREATE TABLE IF NOT EXISTS organisations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name          TEXT NOT NULL,
  -- What everyone actually calls it in conversation and on vouchers.
  short_name    TEXT,

  kind          TEXT NOT NULL DEFAULT 'OTHER'
                  CHECK (kind IN ('PARTNER_CHURCH','INSTITUTION','TRUST',
                                  'COMPANY','FOUNDATION','MISSION_AGENCY','OTHER')),

  -- In LCM's own words: what this body is to LCM. Free text, because the
  -- relationships genuinely differ — one holds property, one sends grants,
  -- one trains pastors.
  relationship  TEXT,

  -- Some of these bodies share LCM's officers or are controlled by LCM. That
  -- has to be disclosed in the accounts, so it is recorded rather than
  -- remembered.
  is_related_party BOOLEAN NOT NULL DEFAULT FALSE,

  country       TEXT DEFAULT 'Malaysia',
  registration_no TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  website       TEXT,

  -- Whoever LCM deals with there, when they have no record of their own.
  contact_name  TEXT,

  since_year    INT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','DORMANT','ENDED')),
  notes         TEXT,

  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One record per body, so a second "ELCA" cannot be typed in beside the first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_name ON organisations (lower(name));
CREATE INDEX IF NOT EXISTS idx_org_kind   ON organisations (kind);
CREATE INDEX IF NOT EXISTS idx_org_status ON organisations (status);

-- ── The person you speak to there ─────────────────────────────────────────
-- A contact is a person, with a phone number and a name, and belongs in the
-- people directory like everyone else — linked to the organisation rather than
-- copied into it, so their details are kept in one place.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_role TEXT;

CREATE INDEX IF NOT EXISTS idx_people_org ON people(organisation_id);

-- The category list gains PARTNER — a contact at one of these bodies. The old
-- constraint is found by what it checks rather than by name: it was declared
-- inline in 099, and a leftover copy under another name would still refuse the
-- new value.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'people'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%PARISH_WORKER%'
  LOOP
    EXECUTE format('ALTER TABLE people DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE people ADD CONSTRAINT people_category_check
  CHECK (category IN ('PASTOR','PARISH_WORKER','HQ_STAFF','VOLUNTEER',
                      'VENDOR','AGENT','PARTNER','OTHER'));

-- ── Who may read and edit ─────────────────────────────────────────────────
-- Unlike people, this holds no personal data — an office address and a
-- switchboard number. Any signed-in user may read it, so a voucher can name
-- the body it is for; only the directory keepers may change it.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_read"  ON organisations;
DROP POLICY IF EXISTS "org_write" ON organisations;
CREATE POLICY "org_read" ON organisations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "org_write" ON organisations
  FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON organisations TO authenticated;

-- ── The bodies LCM already works with ─────────────────────────────────────
INSERT INTO organisations (name, short_name, kind, relationship, is_related_party, country, created_by) VALUES
  ('Luther Study Centre', 'LSC', 'INSTITUTION',
   'Theological study and training centre working with LCM', TRUE, 'Malaysia', 'migration 105'),
  ('Trustees of the Lutheran Church in Malaysia Registered', 'LCM Trustees', 'TRUST',
   'Holds property on behalf of the Lutheran Church in Malaysia', TRUE, 'Malaysia', 'migration 105'),
  ('Highlands Lakeview Enterprises Sdn Bhd', 'Highlands Lakeview', 'COMPANY',
   'Enterprise associated with LCM', TRUE, 'Malaysia', 'migration 105'),
  ('Seeds of Grace Foundation', 'Seeds of Grace', 'FOUNDATION',
   'Foundation supporting LCM ministry and charitable work', TRUE, 'Malaysia', 'migration 105'),
  ('Evangelical Lutheran Church in America', 'ELCA', 'PARTNER_CHURCH',
   'Companion Lutheran church body supporting LCM', FALSE, 'United States', 'migration 105'),
  ('Lutheran Church in Australia', 'LCA', 'PARTNER_CHURCH',
   'Companion Lutheran church body supporting LCM', FALSE, 'Australia', 'migration 105'),
  ('Evangelical Lutheran Church in Bavaria', 'ELCB', 'PARTNER_CHURCH',
   'Companion Lutheran church body supporting LCM', FALSE, 'Germany', 'migration 105')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE organisations IS
  'Partner and associate bodies — companion churches, trusts, foundations and related companies';
COMMENT ON COLUMN organisations.is_related_party IS
  'Shares officers with or is controlled by LCM — disclosable in the accounts';
