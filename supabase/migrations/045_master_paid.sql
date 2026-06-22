-- Track when a Master voucher has been marked paid (moves it to History)
ALTER TABLE bulk_pv_runs
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by TEXT;

CREATE INDEX IF NOT EXISTS idx_bulk_pv_runs_paid_at ON bulk_pv_runs(paid_at);
