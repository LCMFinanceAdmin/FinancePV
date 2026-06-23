-- 051: Payroll — monthly runs, per-employee line snapshots, and the voucher set.

CREATE TABLE payroll_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year            INT NOT NULL,
  month           INT NOT NULL,                       -- 1-12, or 13 = 13th month
  status          TEXT NOT NULL DEFAULT 'DRAFT',      -- DRAFT | FINALIZED | PAID
  total_gross     DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_net       DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_employer  DECIMAL(14,2) NOT NULL DEFAULT 0,   -- total employer contributions
  total_lcm       DECIMAL(14,2) NOT NULL DEFAULT 0,   -- gross + employer contributions
  created_by      TEXT NOT NULL DEFAULT '',
  finalized_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pr_period ON payroll_runs(year, month);

-- One snapshot row per employee per run (the computed sheet line).
CREATE TABLE payroll_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL DEFAULT '',

  gross         DECIMAL(12,2) NOT NULL DEFAULT 0,
  pcb           DECIMAL(12,2) NOT NULL DEFAULT 0,
  epf_ee        DECIMAL(12,2) NOT NULL DEFAULT 0,
  epf_er        DECIMAL(12,2) NOT NULL DEFAULT 0,
  socso_ee      DECIMAL(12,2) NOT NULL DEFAULT 0,
  socso_er      DECIMAL(12,2) NOT NULL DEFAULT 0,
  eis_ee        DECIMAL(12,2) NOT NULL DEFAULT 0,
  eis_er        DECIMAL(12,2) NOT NULL DEFAULT 0,
  epl           DECIMAL(12,2) NOT NULL DEFAULT 0,
  net           DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_lcm     DECIMAL(12,2) NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pl_run ON payroll_lines(run_id);
CREATE INDEX idx_pl_employee ON payroll_lines(employee_id, run_id);

-- The voucher set produced per run: 1 consolidated salary voucher + 4 statutory.
CREATE TABLE payroll_vouchers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                          -- SALARY | EPF | SOCSO | EIS | PCB
  payee        TEXT NOT NULL DEFAULT '',               -- Staff Salaries / KWSP / PERKESO / LHDN
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'PENDING',        -- PENDING | PAID
  paid_at      TIMESTAMPTZ,
  payment_ref  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pv_run ON payroll_vouchers(run_id);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prun_select" ON payroll_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "prun_insert" ON payroll_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prun_update" ON payroll_runs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "prun_delete" ON payroll_runs FOR DELETE TO authenticated USING (true);

ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pline_select" ON payroll_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "pline_insert" ON payroll_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pline_update" ON payroll_lines FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pline_delete" ON payroll_lines FOR DELETE TO authenticated USING (true);

ALTER TABLE payroll_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pvou_select" ON payroll_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "pvou_insert" ON payroll_vouchers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pvou_update" ON payroll_vouchers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pvou_delete" ON payroll_vouchers FOR DELETE TO authenticated USING (true);
