-- 081: GM-managed committee / district / personal options for the GM Claims
-- dropdown. The standard LCM ministries are hardcoded in the app; this table
-- holds the extra ones the GM types in, so they persist and can be removed
-- when no longer needed.

CREATE TABLE IF NOT EXISTS gm_committees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gm_committees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gm_committees_read"   ON gm_committees;
CREATE POLICY "gm_committees_read"   ON gm_committees FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gm_committees_insert" ON gm_committees;
CREATE POLICY "gm_committees_insert" ON gm_committees FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "gm_committees_delete" ON gm_committees;
CREATE POLICY "gm_committees_delete" ON gm_committees FOR DELETE TO authenticated USING (true);
