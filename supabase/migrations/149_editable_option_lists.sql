-- 149: three fixed lists become editable.
--
-- Document kind, document source and organisation kind were CHECK constraints,
-- so adding "Audit Report" meant a migration. They are pure vocabulary —
-- nothing in the app branches on whether a file is Minutes or a Constitution,
-- or whether a body is a Trust or a Foundation. A list nothing depends on has
-- no business being code.
--
-- The lists that stay code are the ones with logic sitting on them: pastor
-- standing (office_eligibility asks whether somebody is a REVEREND), council
-- role (a trigger routes leave to the CHAIRMAN), post tenure (it drives
-- is_elected), and role keys (RLS policies name them). Making those editable
-- would let somebody add a value that silently means nothing, which is worse
-- than not being able to add one at all.
--
-- Modelled on office_categories: key, label, description, order, active. A
-- real foreign key rather than a check, so a kind that is in use cannot be
-- deleted — the database refuses instead of orphaning rows.

CREATE TABLE IF NOT EXISTS document_kinds (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT  NOT NULL DEFAULT 500,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_kind_label_not_blank CHECK (length(trim(label)) > 0)
);

CREATE TABLE IF NOT EXISTS document_sources (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT  NOT NULL DEFAULT 500,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_source_label_not_blank CHECK (length(trim(label)) > 0)
);

CREATE TABLE IF NOT EXISTS organisation_kinds (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INT  NOT NULL DEFAULT 500,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organisation_kind_label_not_blank CHECK (length(trim(label)) > 0)
);

-- Seeded with exactly what the constraints allowed, and the wording the forms
-- already used, so nothing reads differently the day after this runs.
INSERT INTO document_kinds (key, label, description, sort_order) VALUES
  ('ROS_REPORT',         'ROS report',         'Annual return or filing to the Registry of Societies', 10),
  ('STATISTICAL_REPORT', 'Statistical report', 'Membership and attendance returns',                    20),
  ('CORRESPONDENCE',     'Correspondence',     'Letters and messages between HQ and the congregation', 30),
  ('MINUTES',            'Minutes',            'Meeting records',                                      40),
  ('CONSTITUTION',       'Constitution',       'Governing documents and amendments',                   50),
  ('FINANCIAL',          'Financial',          'Accounts, audits and financial returns',               60),
  ('OTHER',              'Other',              '',                                                     900)
ON CONFLICT (key) DO NOTHING;

INSERT INTO document_sources (key, label, description, sort_order) VALUES
  ('EMAIL',    'Email',    '',                                    10),
  ('WHATSAPP', 'WhatsApp', '',                                    20),
  ('LETTER',   'Letter',   'A signed or posted document',         30),
  ('MEETING',  'Meeting',  'Handed over or agreed in person',     40),
  ('OTHER',    'Other',    '',                                   900)
ON CONFLICT (key) DO NOTHING;

INSERT INTO organisation_kinds (key, label, description, sort_order) VALUES
  ('PARTNER_CHURCH', 'Partner Church', 'A companion church body',                       10),
  ('INSTITUTION',    'Institution',    'A college, centre or educational body',         20),
  ('TRUST',          'Trust',          'Holds property or funds',                       30),
  ('COMPANY',        'Company',        'An incorporated enterprise',                    40),
  ('FOUNDATION',     'Foundation',     'A charitable foundation',                       50),
  ('MISSION_AGENCY', 'Mission Agency', 'A sending or supporting mission body',          60),
  ('OTHER',          'Other',          '',                                             900)
ON CONFLICT (key) DO NOTHING;

-- ── Swap the checks for references ────────────────────────────────────────
-- ON DELETE RESTRICT is the point: removing a kind that documents are filed
-- under should fail loudly, not quietly strand them under a value that no
-- longer exists. Taking one out of use is what `active` is for.
ALTER TABLE congregation_documents DROP CONSTRAINT IF EXISTS congregation_documents_kind_check;
ALTER TABLE congregation_documents DROP CONSTRAINT IF EXISTS congregation_documents_source_check;
ALTER TABLE organisations          DROP CONSTRAINT IF EXISTS organisations_kind_check;

ALTER TABLE congregation_documents DROP CONSTRAINT IF EXISTS congregation_documents_kind_fkey;
ALTER TABLE congregation_documents ADD CONSTRAINT congregation_documents_kind_fkey
  FOREIGN KEY (kind) REFERENCES document_kinds(key) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE congregation_documents DROP CONSTRAINT IF EXISTS congregation_documents_source_fkey;
ALTER TABLE congregation_documents ADD CONSTRAINT congregation_documents_source_fkey
  FOREIGN KEY (source) REFERENCES document_sources(key) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_kind_fkey;
ALTER TABLE organisations ADD CONSTRAINT organisations_kind_fkey
  FOREIGN KEY (kind) REFERENCES organisation_kinds(key) ON UPDATE CASCADE ON DELETE RESTRICT;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE document_kinds     ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_sources   ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_kinds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dk_read"  ON document_kinds;
DROP POLICY IF EXISTS "dk_write" ON document_kinds;
DROP POLICY IF EXISTS "ds_read"  ON document_sources;
DROP POLICY IF EXISTS "ds_write" ON document_sources;
DROP POLICY IF EXISTS "ok_read"  ON organisation_kinds;
DROP POLICY IF EXISTS "ok_write" ON organisation_kinds;

-- Readable by anyone signed in — a form that cannot load its own dropdown is
-- broken, and none of these say anything confidential.
CREATE POLICY "dk_read" ON document_kinds     FOR SELECT TO authenticated USING (true);
CREATE POLICY "ds_read" ON document_sources   FOR SELECT TO authenticated USING (true);
CREATE POLICY "ok_read" ON organisation_kinds FOR SELECT TO authenticated USING (true);

CREATE POLICY "dk_write" ON document_kinds     FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());
CREATE POLICY "ds_write" ON document_sources   FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());
CREATE POLICY "ok_write" ON organisation_kinds FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());

GRANT SELECT, INSERT, UPDATE, DELETE ON document_kinds     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_sources   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_kinds TO authenticated;

COMMENT ON TABLE document_kinds IS
  'What a congregation document is. Editable — nothing branches on the value, so a new kind needs no code.';
COMMENT ON TABLE organisation_kinds IS
  'What kind of body an organisation is. Editable for the same reason.';
