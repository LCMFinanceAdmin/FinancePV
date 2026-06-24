-- 055: Facility blocks — BEM blocks out dates (rehearsals, post-event holds,
-- maintenance/renovation). Blocks make dates unavailable on the public form too.

CREATE TABLE facility_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  TEXT,                              -- NULL = all facilities / whole venue
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT NOT NULL DEFAULT 'MAINTENANCE', -- REHEARSAL | EVENT_HOLD | MAINTENANCE | OTHER
  notes        TEXT NOT NULL DEFAULT '',
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fblk_dates ON facility_blocks(start_date, end_date);

ALTER TABLE facility_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fblk_select" ON facility_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "fblk_insert" ON facility_blocks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fblk_update" ON facility_blocks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "fblk_delete" ON facility_blocks FOR DELETE TO authenticated USING (true);

-- Blocked ranges for the public form (no notes/PII). facility_id NULL = blocks all.
CREATE OR REPLACE FUNCTION public_blocked_ranges()
RETURNS TABLE(facility_id TEXT, start_date DATE, end_date DATE)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT facility_id, start_date, end_date FROM facility_blocks;
$$;
GRANT EXECUTE ON FUNCTION public_blocked_ranges() TO anon, authenticated;
