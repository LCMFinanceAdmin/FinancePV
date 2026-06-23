-- 048: Payroll — original commencement base + family allowance component

-- Immutable reference: the base salary at the month of commencement.
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS commencement_base DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Family allowance (pastors with children & non-working spouse: RM300, Bishop RM1000)
ALTER TABLE payroll_salary
  ADD COLUMN IF NOT EXISTS family_allowance DECIMAL(12,2) NOT NULL DEFAULT 0;
