-- 057: bulk_pv_runs didn't track which entity (LCM/BAM/LSC/HLE) a batch belonged
-- to, so dashboards couldn't scope "Recent Activity" by role. Add the column and
-- backfill existing rows from the pv_type of their first child PV.

ALTER TABLE bulk_pv_runs ADD COLUMN IF NOT EXISTS pv_type TEXT NOT NULL DEFAULT 'LCM';

UPDATE bulk_pv_runs b
SET pv_type = p.pv_type
FROM pvs p
WHERE p.id = (b.pv_ids)[1]
  AND p.pv_type IS NOT NULL
  AND b.pv_type = 'LCM';

CREATE INDEX IF NOT EXISTS idx_bulk_pv_runs_pv_type ON bulk_pv_runs(pv_type);
