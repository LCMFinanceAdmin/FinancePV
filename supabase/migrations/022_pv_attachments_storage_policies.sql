-- 022: Add RLS storage policies for pv-attachments bucket
-- The bucket was created in 021 but without upload/read policies.

DO $$
BEGIN
  DROP POLICY IF EXISTS "pv_attachments_upload" ON storage.objects;
  CREATE POLICY "pv_attachments_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'pv-attachments');

  DROP POLICY IF EXISTS "pv_attachments_update" ON storage.objects;
  CREATE POLICY "pv_attachments_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'pv-attachments');

  DROP POLICY IF EXISTS "pv_attachments_read" ON storage.objects;
  CREATE POLICY "pv_attachments_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'pv-attachments');

  DROP POLICY IF EXISTS "pv_attachments_public_read" ON storage.objects;
  CREATE POLICY "pv_attachments_public_read" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'pv-attachments');

  DROP POLICY IF EXISTS "pv_attachments_delete" ON storage.objects;
  CREATE POLICY "pv_attachments_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'pv-attachments');
END $$;
