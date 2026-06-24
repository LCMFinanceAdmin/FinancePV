-- 058: Worksheets for extra workers (PA Personnel, Building Care Taker, RELA
-- Personnel) hired by the Building/Event Manager. The BEM fills hours worked +
-- rate, both the worker and the BEM sign digitally on the same device, and a
-- generated PDF of the signed worksheet becomes the main attachment of the
-- BAM PV raised from it.

CREATE TABLE worker_worksheets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_no     TEXT UNIQUE NOT NULL,
  worker_type      TEXT NOT NULL,              -- PA_PERSONNEL | BUILDING_CARE_TAKER | RELA_PERSONNEL
  worker_name      TEXT NOT NULL DEFAULT '',
  period_type      TEXT NOT NULL DEFAULT 'DAYS',  -- MONTH | DAYS
  period_label     TEXT NOT NULL DEFAULT '',
  entries          JSONB NOT NULL DEFAULT '[]', -- [{date, hours}]
  rate_per_hour    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_hours      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  worker_signature TEXT,
  worker_signed_at TIMESTAMPTZ,
  bem_signature    TEXT,
  bem_signed_by    TEXT,
  bem_signed_at    TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | SIGNED | PV_RAISED
  pdf_url          TEXT,
  pv_id            UUID,
  notes            TEXT NOT NULL DEFAULT '',
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_worksheets_status ON worker_worksheets(status);
CREATE INDEX idx_worksheets_worker_type ON worker_worksheets(worker_type);

ALTER TABLE worker_worksheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_select" ON worker_worksheets FOR SELECT TO authenticated USING (true);
CREATE POLICY "ws_insert" ON worker_worksheets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ws_update" ON worker_worksheets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ws_delete" ON worker_worksheets FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION next_worksheet_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr  TEXT := to_char(now(), 'YYYY');
  seq INT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq FROM worker_worksheets WHERE worksheet_no LIKE 'WS-' || yr || '-%';
  RETURN 'WS-' || yr || '-' || lpad(seq::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION next_worksheet_no() TO authenticated;

-- Storage bucket for the generated signed-worksheet PDFs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('worksheets', 'worksheets', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = true, file_size_limit = 10485760, allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  DROP POLICY IF EXISTS "ws_storage_insert" ON storage.objects;
  CREATE POLICY "ws_storage_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'worksheets');

  DROP POLICY IF EXISTS "ws_storage_select" ON storage.objects;
  CREATE POLICY "ws_storage_select" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'worksheets');

  DROP POLICY IF EXISTS "ws_storage_update" ON storage.objects;
  CREATE POLICY "ws_storage_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'worksheets');
END $$;
