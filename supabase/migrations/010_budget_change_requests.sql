-- Budget change requests: Ministry Heads submit changes that require Finance Admin approval
-- Also adds contributions columns to budget_items (if not yet added)

ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS contributions_received DECIMAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contributions_expected DECIMAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_notes TEXT DEFAULT '';

-- Change request table for Ministry Head → Finance Admin approval workflow
CREATE TABLE IF NOT EXISTS budget_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry         TEXT NOT NULL,
  budget_item_id   UUID REFERENCES budget_items(id) ON DELETE SET NULL,
  change_type      TEXT NOT NULL CHECK (change_type IN ('add', 'edit', 'delete')),
  proposed_data    JSONB NOT NULL DEFAULT '{}',
  requested_by     TEXT NOT NULL,
  requested_at     TIMESTAMPTZ DEFAULT NOW(),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejected_by      TEXT,
  rejected_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  applied_at       TIMESTAMPTZ,
  applied_by       TEXT
);

CREATE INDEX IF NOT EXISTS idx_bcr_ministry  ON budget_change_requests(ministry);
CREATE INDEX IF NOT EXISTS idx_bcr_status    ON budget_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_bcr_requested ON budget_change_requests(requested_by);

ALTER TABLE budget_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bcr_select" ON budget_change_requests
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "bcr_insert" ON budget_change_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "bcr_update" ON budget_change_requests
  FOR UPDATE USING (auth.role() = 'authenticated');
