-- 145: what a congregation record has to carry.
--
-- Three things HQ currently keeps outside the system: the society
-- registration, who sits on the church council, and the paperwork that passes
-- between LCM and the congregation.

-- ── Who may maintain the directory ────────────────────────────────────────
-- congregations and districts both carry the same role list written out
-- inline. Said once here so the tables added below cannot drift from their
-- parent, and so a future change is one edit rather than four.
--
-- Deliberately narrower than can_manage_people(), which also admits the
-- Bishop, Treasurer, Secretary and Administrator: reading the directory is
-- open to everyone signed in, but changing which church sits in which district
-- has always been Finance and the GM.
CREATE OR REPLACE FUNCTION can_manage_directory()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
  );
$$;
REVOKE ALL ON FUNCTION can_manage_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage_directory() TO authenticated;

-- ── 1. The society registration ───────────────────────────────────────────
-- Each congregation is registered with the Registry of Societies in its own
-- right. The number is what every ROS filing is made under, so it belongs on
-- the record rather than in a folder somewhere.
ALTER TABLE congregations ADD COLUMN IF NOT EXISTS ros_number TEXT;
COMMENT ON COLUMN congregations.ros_number IS
  'Registry of Societies registration number for this congregation.';

-- ── 2. The church council ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS congregation_council_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id UUID NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,

  -- CHAIRMAN is the one the leave chain needs; the rest are recorded so the
  -- council can be contacted without first asking who is on it.
  role            TEXT NOT NULL DEFAULT 'MEMBER'
                    CHECK (role IN ('CHAIRMAN','TREASURER','SECRETARY','MEMBER')),
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  sort_order      INT NOT NULL DEFAULT 500,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT council_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_council_congregation
  ON congregation_council_members (congregation_id, sort_order);

-- One chair at a time. Two would make the sync below ambiguous, and a council
-- with two chairmen is a different problem than this table can fix.
CREATE UNIQUE INDEX IF NOT EXISTS idx_council_one_chairman
  ON congregation_council_members (congregation_id)
  WHERE role = 'CHAIRMAN';

-- ── Keeping the leave chain in step ───────────────────────────────────────
-- congregations.council_president_email is what lib/leave-approvers.ts reads,
-- and it stays the field the routing reads rather than being replaced. The
-- council list becomes the place the chairman is EDITED, and this writes the
-- answer back — the same shape as appointing a Dean writing districts.dean_email.
--
-- In a trigger rather than in the page, so the two cannot disagree however the
-- row was written: through the modal, through the API, or by hand.
CREATE OR REPLACE FUNCTION sync_council_chairman()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cong  UUID := COALESCE(NEW.congregation_id, OLD.congregation_id);
  v_name  TEXT;
  v_email TEXT;
BEGIN
  SELECT m.name, m.email INTO v_name, v_email
    FROM congregation_council_members m
   WHERE m.congregation_id = v_cong AND m.role = 'CHAIRMAN'
   LIMIT 1;

  -- Null when the chair has been removed, so leave falls through to the Dean
  -- rather than waiting on an address nobody answers.
  UPDATE congregations
     SET council_president_name  = v_name,
         council_president_email = v_email,
         updated_at = NOW()
   WHERE id = v_cong;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_council_chairman ON congregation_council_members;
CREATE TRIGGER trg_council_chairman
  AFTER INSERT OR UPDATE OR DELETE ON congregation_council_members
  FOR EACH ROW EXECUTE FUNCTION sync_council_chairman();

-- ── 3. The paperwork ──────────────────────────────────────────────────────
-- Modelled on person_documents, which solved the same problem for a person: a
-- file with a kind and a date, and a row that can exist without a file at all,
-- because the note of a phone call is worth keeping.
CREATE TABLE IF NOT EXISTS congregation_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id UUID NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,

  kind            TEXT NOT NULL DEFAULT 'OTHER'
                    CHECK (kind IN ('ROS_REPORT','STATISTICAL_REPORT','CORRESPONDENCE',
                                    'MINUTES','CONSTITUTION','FINANCIAL','OTHER')),
  title           TEXT NOT NULL,
  -- Where it came from: a WhatsApp message and a signed letter carry very
  -- different weight when the matter is disputed later.
  source          TEXT CHECK (source IN ('EMAIL','WHATSAPP','LETTER','MEETING','OTHER')),

  file_path       TEXT,
  file_name       TEXT,
  mime_type       TEXT,
  size_bytes      BIGINT NOT NULL DEFAULT 0,

  -- When the document is dated, which is rarely when it was uploaded. An ROS
  -- report is filed for a year, and that year is what it gets looked up by.
  doc_date        DATE,
  notes           TEXT,
  uploaded_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT congregation_doc_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_cdoc_congregation
  ON congregation_documents (congregation_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_cdoc_kind ON congregation_documents (kind);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE congregation_council_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE congregation_documents       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "council_read"  ON congregation_council_members;
DROP POLICY IF EXISTS "council_write" ON congregation_council_members;
DROP POLICY IF EXISTS "cdoc_read"     ON congregation_documents;
DROP POLICY IF EXISTS "cdoc_write"    ON congregation_documents;

-- Council membership is readable by anyone signed in, as the congregation
-- itself is: it is who to contact, not anything private.
CREATE POLICY "council_read" ON congregation_council_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "council_write" ON congregation_council_members FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());

-- The paperwork is not. Correspondence about a congregation can be sensitive
-- where the congregation itself is not, so this follows who maintains the
-- directory on both sides.
CREATE POLICY "cdoc_read" ON congregation_documents FOR SELECT TO authenticated
  USING (can_manage_directory());
CREATE POLICY "cdoc_write" ON congregation_documents FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());

GRANT SELECT, INSERT, UPDATE, DELETE ON congregation_council_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON congregation_documents       TO authenticated;

-- ── Storage ───────────────────────────────────────────────────────────────
-- Private, like person-docs and employee-docs. Files are reached through a
-- signed URL rather than a public link, so a correspondence file cannot be
-- read by anybody who happens to have its address.
INSERT INTO storage.buckets (id, name, public)
VALUES ('congregation-docs', 'congregation-docs', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "congregation_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "congregation_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "congregation_docs_delete" ON storage.objects;

CREATE POLICY "congregation_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'congregation-docs' AND can_manage_directory());
CREATE POLICY "congregation_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'congregation-docs' AND can_manage_directory());
CREATE POLICY "congregation_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'congregation-docs' AND can_manage_directory());
