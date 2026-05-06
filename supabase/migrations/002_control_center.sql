-- Add authorization + signature fields to user_roles
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS is_authorized BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_path TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by TEXT,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;

-- Recurring PV templates
CREATE TABLE IF NOT EXISTS recurring_pvs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  frequency       TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY','ANNUAL')),
  next_due        DATE,
  last_run        DATE,
  active          BOOLEAN DEFAULT TRUE,
  payee_name      TEXT NOT NULL DEFAULT '',
  payee_bank_name TEXT DEFAULT '',
  payee_bank_acct TEXT DEFAULT '',
  payment_method  TEXT DEFAULT 'Online Transfer',
  amount          NUMERIC NOT NULL DEFAULT 0,
  ministry        TEXT DEFAULT '',
  dept            TEXT DEFAULT '',
  project         TEXT DEFAULT '',
  purpose         TEXT NOT NULL DEFAULT '',
  line_items      JSONB DEFAULT '[]',
  payment_type    TEXT DEFAULT 'GENERAL',
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recurring_pvs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring_pvs_admin" ON recurring_pvs
  USING (auth.role() = 'authenticated');
CREATE POLICY "recurring_pvs_service" ON recurring_pvs FOR ALL
  USING (auth.role() = 'service_role');

-- Supabase Storage bucket for signatures (run in dashboard if not exists)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', true)
-- ON CONFLICT DO NOTHING;

-- Storage policy: authenticated users can upload, all can read
-- CREATE POLICY "sig_upload" ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'signatures');
-- CREATE POLICY "sig_read" ON storage.objects FOR SELECT TO public
--   USING (bucket_id = 'signatures');
