-- Reusable worker directory for BAM worksheets — lets the BEM pick a
-- previously-entered worker by name instead of retyping their bank details
-- every time, and keeps each worker's payout info ready for the PV form.
CREATE TABLE IF NOT EXISTS bam_workers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type      TEXT NOT NULL,
  name             TEXT NOT NULL,
  bank_name        TEXT,
  bank_account_no  TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_type, name)
);

ALTER TABLE bam_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bam_workers_all" ON bam_workers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE worker_worksheets
  ADD COLUMN IF NOT EXISTS bank_name        TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no  TEXT;
