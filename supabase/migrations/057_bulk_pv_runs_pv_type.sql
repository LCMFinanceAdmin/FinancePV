-- 057: bulk_pv_runs didn't track which entity (LCM/BAM/LSC/HLE) a batch belonged
-- to, so dashboards couldn't scope "Recent Activity" by role. Add the column and
-- backfill existing rows from the pv_type of their first child PV.

ALTER TABLE bulk_pv_runs ADD COLUMN IF NOT EXISTS pv_type TEXT NOT NULL DEFAULT 'LCM';

-- pv_ids is stored as jsonb (not a native array), so pull its first element
-- with ->>0 (jsonb arrays are 0-indexed) and cast it to uuid to match pvs.id.
UPDATE bulk_pv_runs b
SET pv_type = p.pv_type
FROM pvs p
WHERE jsonb_typeof(b.pv_ids) = 'array'
  AND jsonb_array_length(b.pv_ids) > 0
  AND p.id = (b.pv_ids->>0)::uuid
  AND p.pv_type IS NOT NULL
  AND b.pv_type = 'LCM';

CREATE INDEX IF NOT EXISTS idx_bulk_pv_runs_pv_type ON bulk_pv_runs(pv_type);
