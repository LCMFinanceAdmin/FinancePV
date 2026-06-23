-- 052: Facility bookings — scanned form attachments + storage bucket.
-- The booking form is printed, signed by the applicant's pastor and office-stamped,
-- then scanned back in for verification.

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT '{}';

-- Storage bucket for the scanned forms.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-forms', 'booking-forms', true, 20971520,  -- 20 MB
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true, file_size_limit = 20971520, allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  DROP POLICY IF EXISTS "bf_insert_auth" ON storage.objects;
  CREATE POLICY "bf_insert_auth" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'booking-forms');

  -- Public booking form needs to upload the scanned form too.
  DROP POLICY IF EXISTS "bf_insert_anon" ON storage.objects;
  CREATE POLICY "bf_insert_anon" ON storage.objects
    FOR INSERT TO anon WITH CHECK (bucket_id = 'booking-forms');

  DROP POLICY IF EXISTS "bf_select_all" ON storage.objects;
  CREATE POLICY "bf_select_all" ON storage.objects
    FOR SELECT TO authenticated, anon USING (bucket_id = 'booking-forms');

  DROP POLICY IF EXISTS "bf_delete_auth" ON storage.objects;
  CREATE POLICY "bf_delete_auth" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'booking-forms');
END $$;
