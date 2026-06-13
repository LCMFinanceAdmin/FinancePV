-- 021: Ensure payment-receipts storage bucket exists and is public
-- The original migration 018 may not have been applied on all environments.
-- This is idempotent — safe to run even if the bucket already exists.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  true,
  20971520,   -- 20 MB max
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520;

-- Ensure pv-attachments bucket also exists (for PV supporting docs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pv-attachments',
  'pv-attachments',
  true,
  20971520,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520;

-- Policies for payment-receipts
DO $$
BEGIN
  DROP POLICY IF EXISTS "receipts_upload" ON storage.objects;
  CREATE POLICY "receipts_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'payment-receipts');

  DROP POLICY IF EXISTS "receipts_read" ON storage.objects;
  CREATE POLICY "receipts_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-receipts');

  -- Allow public (anon) read since bucket is public
  DROP POLICY IF EXISTS "receipts_public_read" ON storage.objects;
  CREATE POLICY "receipts_public_read" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'payment-receipts');
END $$;
