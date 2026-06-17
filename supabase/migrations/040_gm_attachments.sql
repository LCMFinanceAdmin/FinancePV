-- 040: Dedicated storage bucket for GM claim supporting documents
-- Replaces the attempt to reuse pv-attachments (which has restrictive MIME types).
-- Also ensures gm_claims table has explicit grants for authenticated role.

-- ── Table grants (belt-and-suspenders alongside RLS) ─────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON gm_claims TO authenticated;

-- ── Storage bucket ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gm-claim-attachments',
  'gm-claim-attachments',
  true,
  20971520,  -- 20 MB
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage policies ──────────────────────────────────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS "gm_att_insert" ON storage.objects;
  CREATE POLICY "gm_att_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'gm-claim-attachments');

  DROP POLICY IF EXISTS "gm_att_select" ON storage.objects;
  CREATE POLICY "gm_att_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'gm-claim-attachments');

  DROP POLICY IF EXISTS "gm_att_public_read" ON storage.objects;
  CREATE POLICY "gm_att_public_read" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'gm-claim-attachments');

  DROP POLICY IF EXISTS "gm_att_delete" ON storage.objects;
  CREATE POLICY "gm_att_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'gm-claim-attachments');
END $$;
