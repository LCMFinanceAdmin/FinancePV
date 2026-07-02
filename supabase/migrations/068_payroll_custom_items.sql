-- Per-employee custom allowances and deductions, scoped per month.
-- Finance Executive / Accounts Executive can add items for a specific employee
-- for a specific month directly on the employee payroll page.
CREATE TABLE payroll_employee_custom_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  month       INT  NOT NULL CHECK (month BETWEEN 1 AND 13),
  label       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('allowance', 'deduction')),
  amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emp_custom_items_lookup ON payroll_employee_custom_items(employee_id, year, month);

-- Snapshot stored per employee when a payroll run is finalized.
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS custom_items JSONB DEFAULT '[]';

ALTER TABLE payroll_employee_custom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_custom_items_all" ON payroll_employee_custom_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
