-- Add master PV support to bulk_pv_runs
ALTER TABLE bulk_pv_runs
  ADD COLUMN IF NOT EXISTS is_master          BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS master_name        TEXT,
  ADD COLUMN IF NOT EXISTS child_group_names  TEXT[]   DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_bulk_pv_runs_is_master ON bulk_pv_runs(is_master);
