-- 074: Employee maintenance file — documents with folders, expiry tracking and notes.
-- Run manually in the Supabase dashboard SQL editor.

CREATE TABLE employee_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  folder       TEXT NOT NULL DEFAULT 'GENERAL',
  -- EMPLOYMENT | TAX | IMMIGRATION | AGREEMENTS | CORRESPONDENCE | GENERAL
  title        TEXT NOT NULL,
  file_path    TEXT NOT NULL DEFAULT '',   -- storage object path in employee-docs bucket
  file_name    TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL DEFAULT '',
  size_bytes   BIGINT NOT NULL DEFAULT 0,
  valid_from   DATE,
  expiry_date  DATE,                        -- NULL = does not expire
  notes        TEXT NOT NULL DEFAULT '',
  uploaded_by  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edoc_employee ON employee_documents(employee_id);
CREATE INDEX idx_edoc_expiry ON employee_documents(expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edoc_select" ON employee_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "edoc_insert" ON employee_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "edoc_update" ON employee_documents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "edoc_delete" ON employee_documents FOR DELETE TO authenticated USING (true);

-- Private bucket — confidential HR documents, always accessed via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-docs',
  'employee-docs',
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

CREATE POLICY "employee_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-docs');

CREATE POLICY "employee_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'employee-docs');

CREATE POLICY "employee_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'employee-docs');
