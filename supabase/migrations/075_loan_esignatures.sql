-- 075: Employee loans — three-party e-signatures (Applicant / Bishop / Treasurer)
-- and supporting attachment. Run manually in the Supabase dashboard SQL editor
-- AFTER 074a (attachments reuse the private employee-docs bucket).

ALTER TABLE employee_loans
  ADD COLUMN IF NOT EXISTS signatures JSONB NOT NULL DEFAULT '{}',
  -- { "applicant": {name,email,role,signature,signed_at},
  --   "bishop": {...}, "treasurer": {...} }
  ADD COLUMN IF NOT EXISTS attachment_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachment_name TEXT NOT NULL DEFAULT '';
