-- GM Claims Tracker
-- Allows the General Manager to log payment claims received directly from
-- EXCO members / Pastors and track them through the full PV lifecycle.

CREATE TABLE gm_claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no        TEXT UNIQUE NOT NULL,             -- CLM-YYYY-NNN
  claimant_name   TEXT NOT NULL,
  claimant_email  TEXT,
  ministry        TEXT,
  project         TEXT,
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  purpose         TEXT NOT NULL,
  description     TEXT,
  attachments     TEXT[] DEFAULT '{}',
  pv_id           UUID REFERENCES pvs(id) ON DELETE SET NULL,
  notes           TEXT,                             -- GM internal notes
  created_by_email TEXT NOT NULL,
  received_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gm_claims_pv     ON gm_claims(pv_id);
CREATE INDEX idx_gm_claims_created ON gm_claims(created_at DESC);

ALTER TABLE gm_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gm_claims_read"   ON gm_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "gm_claims_insert" ON gm_claims FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gm_claims_update" ON gm_claims FOR UPDATE TO authenticated USING (true);

-- Auto-generate claim_no: CLM-YYYY-NNN
CREATE OR REPLACE FUNCTION next_claim_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr  TEXT := to_char(NOW(), 'YYYY');
  seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(split_part(claim_no, '-', 3) AS INT)), 0) + 1
    INTO seq
    FROM gm_claims
    WHERE claim_no LIKE 'CLM-' || yr || '-%';
  RETURN 'CLM-' || yr || '-' || LPAD(seq::TEXT, 3, '0');
END;
$$;
