-- 011: Purchase Requests table
-- Pre-PV approval layer: EXCO Members submit purchase requests with quotations,
-- GM/Signatories approve them, then Finance Admin raises a PV from the approved request.

CREATE TABLE IF NOT EXISTS purchase_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no          TEXT UNIQUE NOT NULL,
  title               TEXT NOT NULL,
  ministry            TEXT NOT NULL,
  project             TEXT,
  submitted_by_email  TEXT NOT NULL,
  submitted_by_name   TEXT,
  purpose             TEXT,
  estimated_amount    DECIMAL(12,2) DEFAULT 0,
  vendor_name         TEXT,
  line_items          JSONB DEFAULT '[]'::jsonb,
  attachments         TEXT[] DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'SUBMITTED',
  approvals           JSONB DEFAULT '[]'::jsonb,
  admin_comment       TEXT,
  pv_id               UUID,
  submitted_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_ministry  ON purchase_requests(ministry);
CREATE INDEX IF NOT EXISTS idx_pr_status    ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_submitted ON purchase_requests(submitted_by_email);

-- RLS: all authenticated users can read, insert, and update
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select" ON purchase_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pr_insert" ON purchase_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "pr_update" ON purchase_requests
  FOR UPDATE TO authenticated USING (true);
