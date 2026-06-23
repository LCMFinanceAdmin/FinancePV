-- 050: Payroll — Employee Personal Loans (EPL) + repayment tracking

CREATE TABLE employee_loans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_no             TEXT UNIQUE NOT NULL,                  -- EPL-2026-001
  employee_id         UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,

  principal           DECIMAL(12,2) NOT NULL DEFAULT 0,      -- e.g. 10000
  monthly_installment DECIMAL(12,2) NOT NULL DEFAULT 0,      -- e.g. 280
  term_months         INT NOT NULL DEFAULT 0,                -- e.g. 36
  final_installment   DECIMAL(12,2) NOT NULL DEFAULT 0,      -- e.g. 200 (0 = compute remainder)
  start_month         DATE,                                  -- first repayment month

  purpose             TEXT NOT NULL DEFAULT '',
  agreement_url       TEXT NOT NULL DEFAULT '',

  status              TEXT NOT NULL DEFAULT 'PENDING',       -- PENDING|ACTIVE|SETTLED|REJECTED|CANCELLED
  approvals           JSONB NOT NULL DEFAULT '[]',           -- GM + signatory, same shape as PV approvals

  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_el_employee ON employee_loans(employee_id);
CREATE INDEX idx_el_status   ON employee_loans(status);

-- Actual repayments recorded as payroll runs deduct them (Phase 5 populates this).
CREATE TABLE loan_repayments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         UUID NOT NULL REFERENCES employee_loans(id) ON DELETE CASCADE,
  payroll_run_id  UUID,
  year            INT NOT NULL,
  month           INT NOT NULL,                              -- 1-12
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_after   DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lr_loan ON loan_repayments(loan_id);
CREATE UNIQUE INDEX idx_lr_loan_period ON loan_repayments(loan_id, year, month);

-- Next loan number (EPL-YYYY-NNN)
CREATE OR REPLACE FUNCTION next_loan_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr     TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix TEXT := 'EPL-' || yr || '-';
  last   INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(loan_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM employee_loans WHERE loan_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "el_select" ON employee_loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "el_insert" ON employee_loans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "el_update" ON employee_loans FOR UPDATE TO authenticated USING (true);
CREATE POLICY "el_delete" ON employee_loans FOR DELETE TO authenticated USING (true);

ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lr_select" ON loan_repayments FOR SELECT TO authenticated USING (true);
CREATE POLICY "lr_insert" ON loan_repayments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lr_update" ON loan_repayments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "lr_delete" ON loan_repayments FOR DELETE TO authenticated USING (true);
