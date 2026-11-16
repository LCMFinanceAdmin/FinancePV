-- Unpaid leave, as days rather than as an amount.
--
-- Days, deliberately. A deduction stored as a figure goes stale the moment
-- the salary behind it changes — which is exactly how this payroll came to
-- carry eleven corrections re-imposing contributions nobody owed, each keyed
-- against a salary that was later revised. Days survive a revision: the amount
-- is worked out from the wage in force when the sheet is drawn, so it is right
-- by construction rather than right until something moves.
--
-- A day is the month's pay over the month's calendar days — the Employment
-- Act's basis for an incomplete month, and the same divisor the rest of this
-- payroll already uses. February is over 28.
--
-- The deduction lands AFTER the statutory figures: EPF, SOCSO and EIS are
-- worked out on the full agreed wage and only take-home falls. That is the
-- General Manager's instruction of November 2026. It differs from how a
-- part-month joiner is handled, where the wage actually payable carries the
-- contributions, and the difference is intended.
--
-- Months 1-12 only. A 13th month is a payment for the year, not a month
-- worked, so no day of it can be unpaid; the check below says so rather than
-- leaving it to the arithmetic.
--
-- Where the days come from: by rights an UNPAID leave application, approved in
-- the leave module — the type already exists. The church has not adopted that
-- route yet, so Finance keys the days on the yearly sheet and this table holds
-- what they keyed. When approvals do start, an approved application fills the
-- same row, and the keyed figure stays the one that governs.

BEGIN;

CREATE TABLE IF NOT EXISTS payroll_unpaid_leave (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  year        int  NOT NULL,
  month       int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  -- Half days are real, so this is not an integer. Negative days are not.
  days        numeric(5,2) NOT NULL CHECK (days >= 0),
  note        text,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz,
  UNIQUE (employee_id, year, month)
);

COMMENT ON TABLE payroll_unpaid_leave IS
  'Days of unpaid leave per employee per month. The amount is derived from the '
  'salary in force — see lib/payroll/calc.ts — and is deliberately not stored.';
COMMENT ON COLUMN payroll_unpaid_leave.days IS
  'Calendar days absent without pay. Priced at the month''s gross over the '
  'month''s calendar days, and deducted after the statutory figures.';

CREATE INDEX IF NOT EXISTS idx_unpaid_leave_lookup
  ON payroll_unpaid_leave (employee_id, year, month);

ALTER TABLE payroll_unpaid_leave ENABLE ROW LEVEL SECURITY;

-- Read and write exactly as a payroll adjustment: the person it is about may
-- see their own, those who keep and oversee the payroll may see everyone's,
-- and only the six who may change a figure may change this one. Nothing here
-- widens who sees what anybody is paid.
DROP POLICY IF EXISTS pul_read  ON payroll_unpaid_leave;
DROP POLICY IF EXISTS pul_write ON payroll_unpaid_leave;

CREATE POLICY pul_read ON payroll_unpaid_leave FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);
CREATE POLICY pul_write ON payroll_unpaid_leave FOR ALL
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

-- A finalised run keeps the figures it was finalised with, so the days and the
-- amount are snapshotted onto the line alongside everything else. Reading them
-- back from payroll_unpaid_leave would make an issued payslip change whenever
-- somebody later corrected the month, which is the one thing a payslip must
-- not do.
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS unpaid_days   numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS unpaid_amount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payroll_lines.unpaid_days IS
  'Days of unpaid leave this payslip was finalised with.';
COMMENT ON COLUMN payroll_lines.unpaid_amount IS
  'What those days came to, deducted after the statutory figures.';

COMMIT;
