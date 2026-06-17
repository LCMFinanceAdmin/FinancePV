-- 028: Storage bucket for GM claim supporting documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gm-claim-attachments',
  'gm-claim-attachments',
  true,
  20971520,  -- 20 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "gm_claim_att_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gm-claim-attachments');

-- Allow authenticated users to read
CREATE POLICY "gm_claim_att_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'gm-claim-attachments');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "gm_claim_att_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'gm-claim-attachments');
