-- 054: Editable facility rates. Overrides the hardcoded defaults in lib/facilities.ts.
-- A row per facility holds the current per-tier rates; absence = use the code default.

CREATE TABLE facility_rates (
  facility_id      TEXT PRIMARY KEY,                 -- matches FACILITIES[].id
  rates            JSONB NOT NULL DEFAULT '{}',      -- { PUBLIC, MEMBER, CONGREGATION, HQ }
  concurrent_rates JSONB,                            -- nullable; halls only
  updated_by       TEXT NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE facility_rates ENABLE ROW LEVEL SECURITY;
-- Public booking form (anon) needs to read effective rates; editing is app-gated to BEM/Finance.
CREATE POLICY "fr_select" ON facility_rates FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "fr_insert" ON facility_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fr_update" ON facility_rates FOR UPDATE TO authenticated USING (true);
