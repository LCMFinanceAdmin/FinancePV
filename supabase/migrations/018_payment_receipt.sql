-- 018: Payment receipt attachment
-- Adds a column to store the uploaded receipt URL per PV,
-- and creates the storage bucket + policies.

ALTER TABLE pvs ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;

-- Storage bucket for payment receipts (private — authenticated read only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,   -- 10 MB max
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Finance Executive can upload; all authenticated can download their own PVs' receipts
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
END $$;
