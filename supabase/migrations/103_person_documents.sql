-- 103: Documents kept against a person.
--
-- employee_documents already exists, but it hangs off payroll_employees, so
-- only someone on the payroll can have a file. A vendor's contract, a council
-- member's correspondence, a volunteer's consent form had nowhere to live.
--
-- This hangs off `people` instead, which covers everyone the directory knows.
-- The payroll maintenance file stays where it is — it is a payroll record with
-- expiry tracking, a different job from "keep this letter permanently".
--
-- These are the most sensitive files in the system: employment letters, IC
-- copies, private correspondence. Unlike the other buckets, this one is not
-- readable by any signed-in user — only the roles that keep the directory.

CREATE TABLE IF NOT EXISTS person_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  -- What kind of thing this is, so a file can be found without opening it.
  kind         TEXT NOT NULL DEFAULT 'OTHER'
                 CHECK (kind IN ('EMPLOYMENT_LETTER','CONTRACT','APPOINTMENT',
                                 'CORRESPONDENCE','IDENTITY','CERTIFICATE',
                                 'RESIGNATION','OTHER')),
  title        TEXT NOT NULL,
  -- Where the correspondence came from, since a WhatsApp message and a signed
  -- letter carry very different weight.
  source       TEXT CHECK (source IN ('EMAIL','WHATSAPP','LETTER','MEETING','OTHER')),
  -- Null for a note with no attachment: minutes of a phone call are worth
  -- keeping even when there is no file.
  file_path    TEXT,
  file_name    TEXT,
  mime_type    TEXT,
  size_bytes   BIGINT NOT NULL DEFAULT 0,
  -- When the document is dated, which is rarely when it was uploaded.
  doc_date     DATE,
  notes        TEXT,
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdoc_person ON person_documents(person_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_pdoc_kind   ON person_documents(kind);

ALTER TABLE person_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdoc_read"  ON person_documents;
DROP POLICY IF EXISTS "pdoc_write" ON person_documents;
CREATE POLICY "pdoc_read" ON person_documents
  FOR SELECT TO authenticated USING (can_manage_people());
CREATE POLICY "pdoc_write" ON person_documents
  FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON person_documents TO authenticated;

-- Private bucket, reached only through signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'person-docs',
  'person-docs',
  false,
  20971520,  -- 20 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- The other document buckets let any signed-in user read them. That is wrong
-- here: an employment letter is not something the whole church should be able
-- to fetch by guessing a path.
DROP POLICY IF EXISTS "person_docs_insert" ON storage.objects;
CREATE POLICY "person_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'person-docs' AND can_manage_people());

DROP POLICY IF EXISTS "person_docs_select" ON storage.objects;
CREATE POLICY "person_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'person-docs' AND can_manage_people());

DROP POLICY IF EXISTS "person_docs_delete" ON storage.objects;
CREATE POLICY "person_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'person-docs' AND can_manage_people());
