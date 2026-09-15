-- 214: proof that the congregation was told.
--
-- The General Manager's rule took the congregation off the approval chain: they
-- are told, not asked. That leaves the pastor with something to show and no
-- way to show it — the Dean or Pastor in Charge signing the leave has no sight
-- of whether the congregation was actually notified, and the pastor who wrote
-- the letter has nowhere to put it.
--
-- So the letter, the filled form or the forwarded email goes on the application
-- itself. Not an approval and not a requirement: a document the approver can
-- open before they sign, and the pastor's own record that they did what the
-- church asks of them.
--
-- Separate from attachment_url, which is the medical certificate and the like.
-- One field holding two unrelated kinds of document is a field nobody can
-- interpret without opening it.

ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS congregation_ack_url  TEXT,
  ADD COLUMN IF NOT EXISTS congregation_ack_name TEXT,
  ADD COLUMN IF NOT EXISTS congregation_ack_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS congregation_ack_note TEXT;

COMMENT ON COLUMN leave_applications.congregation_ack_url IS
  'Where the pastor''s notice to their congregation is stored — a letter, a filled form, a forwarded email. Evidence for the approver, never a requirement.';
COMMENT ON COLUMN leave_applications.congregation_ack_note IS
  'How the congregation was told, in the pastor''s own words, when there is no document to attach.';

-- Private. A letter to a congregation about somebody's absence is theirs and
-- the church's, not the internet's.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leave-docs', 'leave-docs', false, 20971520,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'message/rfc822',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anybody signed in may read: the people who need to are the approver, the
-- applicant and whoever reviews leave afterwards, and that set is most of the
-- staff. Writing is narrower — see below.
DROP POLICY IF EXISTS "leave_docs_select" ON storage.objects;
CREATE POLICY "leave_docs_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'leave-docs');

-- Upload under your own address only. The path is <email>/<leave_no>/<file>,
-- so this says a pastor attaches to their own application and nobody else's —
-- an approver who wants something added asks for it rather than adding it.
DROP POLICY IF EXISTS "leave_docs_insert" ON storage.objects;
CREATE POLICY "leave_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'leave-docs'
    AND lower((storage.foldername(name))[1]) = lower(auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "leave_docs_delete" ON storage.objects;
CREATE POLICY "leave_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'leave-docs'
    AND lower((storage.foldername(name))[1]) = lower(auth.jwt() ->> 'email')
  );

SELECT (SELECT count(*) FROM storage.buckets WHERE id='leave-docs')          AS bucket,
       (SELECT string_agg(column_name, ', ' ORDER BY column_name)
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='leave_applications'
           AND column_name LIKE 'congregation_ack%')                          AS columns_added;
