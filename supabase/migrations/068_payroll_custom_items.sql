-- Custom item definitions per payroll run (e.g. "Housing Allowance", "Uniform Deduction")
CREATE TABLE payroll_run_custom_defs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('allowance', 'deduction')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-employee amounts for each custom def
CREATE TABLE payroll_run_custom_amounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  def_id      UUID NOT NULL REFERENCES payroll_run_custom_defs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_def_emp UNIQUE (def_id, employee_id)
);

-- Snapshot stored per employee when a run is finalized
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS custom_items JSONB DEFAULT '[]';

-- RLS
ALTER TABLE payroll_run_custom_defs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run_custom_amounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_defs_all"   ON payroll_run_custom_defs   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "custom_amounts_all" ON payroll_run_custom_amounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
