-- 046: Payroll module — Phase 1: employee master + versioned salary components

CREATE TABLE payroll_employees (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_no                TEXT UNIQUE NOT NULL,            -- EMP-001
  full_name             TEXT NOT NULL DEFAULT '',
  ic_no                 TEXT NOT NULL DEFAULT '',
  dob                   DATE,
  designation           TEXT NOT NULL DEFAULT '',

  -- Classification
  employment_type       TEXT NOT NULL DEFAULT 'PERMANENT', -- PERMANENT | CONTRACT
  is_pastor             BOOLEAN NOT NULL DEFAULT false,
  prior_experience_years INT NOT NULL DEFAULT 0,           -- for 5-yr pastor bonus
  is_orang_asli         BOOLEAN NOT NULL DEFAULT false,    -- separate EPF/13th-month rules
  date_commenced        DATE,                              -- drives increment timing & service years

  -- Posting / placement
  posting_type          TEXT NOT NULL DEFAULT 'OFFICE',    -- CHURCH | OFFICE | OTHER
  church_name           TEXT NOT NULL DEFAULT '',          -- when CHURCH
  department            TEXT NOT NULL DEFAULT '',          -- when OFFICE

  -- LHDN / tax-relief fields (inform manual PCB)
  marital_status        TEXT NOT NULL DEFAULT '',          -- SINGLE | MARRIED | ...
  spouse_working        BOOLEAN NOT NULL DEFAULT false,
  children_under_18     INT NOT NULL DEFAULT 0,
  children_in_college   INT NOT NULL DEFAULT 0,

  -- EPF
  epf_voluntary_ee_amount DECIMAL(12,2) NOT NULL DEFAULT 0, -- fixed RM voluntary EE top-up
  revised_note          TEXT NOT NULL DEFAULT '',           -- display-only, e.g. "1 JAN 2013 (EPF 13% + 3%)"
  employer_tax_ref      TEXT NOT NULL DEFAULT '',

  -- Payout
  bank_name             TEXT NOT NULL DEFAULT '',
  bank_acct             TEXT NOT NULL DEFAULT '',

  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE | RESIGNED
  resigned_date         DATE,

  created_by            TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pe_status       ON payroll_employees(status);
CREATE INDEX idx_pe_posting_type ON payroll_employees(posting_type);

-- Versioned agreed salary components — a new row per revision keeps full history.
CREATE TABLE payroll_salary (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  effective_from     DATE NOT NULL,

  base_salary        DECIMAL(12,2) NOT NULL DEFAULT 0,
  stm_allowance      DECIMAL(12,2) NOT NULL DEFAULT 0,   -- STM / fixed allowance
  experience_bonus   DECIMAL(12,2) NOT NULL DEFAULT 0,   -- 5-yr-max pastor bonus
  increment_carried  DECIMAL(12,2) NOT NULL DEFAULT 0,   -- total increment since prior years
  increment_current  DECIMAL(12,2) NOT NULL DEFAULT 0,   -- this year's increment

  reason             TEXT NOT NULL DEFAULT '',           -- why revised (increment / policy / etc.)
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT NOW()           -- revision timestamp
);

CREATE INDEX idx_ps_employee ON payroll_salary(employee_id, effective_from DESC);

-- Next employee number (EMP-NNN)
CREATE OR REPLACE FUNCTION next_emp_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  prefix TEXT := 'EMP-';
  last   INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(emp_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM payroll_employees WHERE emp_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

-- RLS — payroll is sensitive; reads/writes are gated in-app to Finance/Accounts/GM.
-- (App-level role checks; table-level kept open to authenticated like other modules.)
ALTER TABLE payroll_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pe_select" ON payroll_employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "pe_insert" ON payroll_employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pe_update" ON payroll_employees FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pe_delete" ON payroll_employees FOR DELETE TO authenticated USING (true);

ALTER TABLE payroll_salary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_select" ON payroll_salary FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps_insert" ON payroll_salary FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ps_update" ON payroll_salary FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ps_delete" ON payroll_salary FOR DELETE TO authenticated USING (true);
