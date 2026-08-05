-- 087: Track which period each recurring expense has been processed for.
--
-- recurring_pvs.last_run / current_period only ever hold the most recent run,
-- so processing August and then September erased any record that August was
-- done. Utilities and allowances are exactly the kind of thing where you need
-- to answer "has the August electricity PV been raised yet?" months later.
--
-- One row per recurring item per period, created when the PV is raised. The
-- unique constraint is what makes a period idempotent: running August twice
-- cannot produce two PVs for the same bill.

CREATE TABLE IF NOT EXISTS recurring_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_id  UUID NOT NULL REFERENCES recurring_pvs(id) ON DELETE CASCADE,
  -- Sortable key for the period: 2026-08, 2026-Q3, 2026-H2, 2026.
  period_key    TEXT NOT NULL,
  -- How it reads on the voucher, e.g. "August 2026".
  period_label  TEXT NOT NULL,
  pv_id         UUID REFERENCES pvs(id) ON DELETE SET NULL,
  pv_no         TEXT,
  amount        NUMERIC NOT NULL DEFAULT 0,
  run_by        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recurring_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_recurring_runs_item   ON recurring_runs(recurring_id);
CREATE INDEX IF NOT EXISTS idx_recurring_runs_period ON recurring_runs(period_key);

ALTER TABLE recurring_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_runs_read" ON recurring_runs;
CREATE POLICY "recurring_runs_read" ON recurring_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "recurring_runs_insert" ON recurring_runs;
CREATE POLICY "recurring_runs_insert" ON recurring_runs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recurring_runs_update" ON recurring_runs;
CREATE POLICY "recurring_runs_update" ON recurring_runs
  FOR UPDATE TO authenticated USING (true);

-- Deleting a run is how a mistaken period is undone, so the period can be
-- processed again after the wrong PV is cancelled.
DROP POLICY IF EXISTS "recurring_runs_delete" ON recurring_runs;
CREATE POLICY "recurring_runs_delete" ON recurring_runs
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_runs TO authenticated;

-- Backfill what can be recovered: the most recent run of each item, so items
-- already processed this cycle don't look untouched on the new period view.
INSERT INTO recurring_runs (recurring_id, period_key, period_label, pv_id, pv_no, amount, run_by, created_at)
SELECT
  r.id,
  CASE r.frequency
    WHEN 'MONTHLY'     THEN to_char(r.last_run, 'YYYY-MM')
    WHEN 'QUARTERLY'   THEN to_char(r.last_run, 'YYYY') || '-Q' || to_char(r.last_run, 'Q')
    WHEN 'HALF_YEARLY' THEN to_char(r.last_run, 'YYYY') || '-H' || CASE WHEN EXTRACT(MONTH FROM r.last_run) <= 6 THEN '1' ELSE '2' END
    ELSE to_char(r.last_run, 'YYYY')
  END,
  COALESCE(r.current_period, to_char(r.last_run, 'Mon YYYY')),
  -- current_pv_id can point at a voucher that has since been deleted, which
  -- the foreign key rejects. The PV number is kept either way, so the run is
  -- still traceable even when the voucher itself is gone.
  CASE WHEN EXISTS (SELECT 1 FROM pvs p WHERE p.id = r.current_pv_id)
       THEN r.current_pv_id ELSE NULL END,
  r.current_pv_no,
  COALESCE(r.amount, 0),
  'migration_087',
  COALESCE(r.last_run::timestamptz, NOW())
FROM recurring_pvs r
WHERE r.last_run IS NOT NULL
ON CONFLICT (recurring_id, period_key) DO NOTHING;
