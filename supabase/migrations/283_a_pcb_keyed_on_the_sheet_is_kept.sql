-- 283: a PCB keyed on the yearly sheet is kept.
--
-- It was not. The PCB boxes on the sheet were page state and nothing else —
-- seeded for months 1-12 from payroll_employees.fixed_pcb, never loaded from
-- anywhere, never saved. A figure typed into one lasted until the page was
-- refreshed.
--
-- That matters because the sheet is printed as the Employee Salary Statement.
-- Two people could print the same employee's statement and get different
-- annual PCB totals, depending on whether one of them had typed into a box
-- first. Observed on EMP-188: 912 keyed against the 13th month, an ANNUAL of
-- 5,520 on screen and 4,608 on a fresh load of the same page.
--
-- It is also the only figure anybody keys on that sheet with nowhere to go.
-- Unpaid days have payroll_unpaid_leave, corrections have payroll_adjustments,
-- standing allowances have payroll_employee_custom_items. PCB had neither a
-- table of its own nor a reading of what was actually paid.
--
-- Months 1-13, the 13th being the bonus. It is kept separate from the monthly
-- figure on purpose: a 13th month is taxed on its own footing and is not the
-- monthly deduction repeated, which is why the seeding deliberately never
-- filled it.
--
-- WHAT THIS IS NOT: it is not what was paid. payroll_lines.pcb is that, and a
-- finalised run's figure governs the month it belongs to — see pcbForMonth in
-- lib/payroll/pcb.ts. This table holds what Finance keyed for a month that has
-- not been run, which is a projection, and the sheet says so. Without that
-- order of precedence a keyed figure would quietly outlive the run that
-- superseded it, and the statement would contradict the payslip.
--
-- Zero is a real answer and is stored. Clearing the box removes the row, and
-- the month falls back to the standing monthly figure. The two are different
-- statements — "no PCB this month" and "nobody has said" — and a table that
-- could not tell them apart would make the first unsayable.

BEGIN;

CREATE TABLE IF NOT EXISTS payroll_sheet_pcb (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  year        int  NOT NULL,
  -- 13 is the 13th month, as everywhere else in this schema.
  month       int  NOT NULL CHECK (month BETWEEN 1 AND 13),
  -- Negative PCB is a refund, which is an adjustment and not this.
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  note        text,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz,
  UNIQUE (employee_id, year, month)
);

COMMENT ON TABLE payroll_sheet_pcb IS
  'PCB keyed on the yearly sheet for a month that has not been run. A '
  'projection, not a record: payroll_lines.pcb is what was actually paid and '
  'governs any month that has been finalised. Months 1-13, 13 being the bonus.';
COMMENT ON COLUMN payroll_sheet_pcb.amount IS
  'What Finance expects to withhold. Zero is a real answer and is stored; no '
  'row at all means nobody has said, and the month falls back to '
  'payroll_employees.fixed_pcb — which is monthly, so it never fills month 13.';

CREATE INDEX IF NOT EXISTS idx_sheet_pcb_lookup
  ON payroll_sheet_pcb (employee_id, year, month);

ALTER TABLE payroll_sheet_pcb ENABLE ROW LEVEL SECURITY;

-- Read and write exactly as unpaid leave and a payroll adjustment: the person
-- it is about may see their own, those who keep and oversee the payroll may
-- see everyone's, and only the six who may change a payroll figure may change
-- this one. Nothing here widens who sees what anybody is paid.
DROP POLICY IF EXISTS psp_read  ON payroll_sheet_pcb;
DROP POLICY IF EXISTS psp_write ON payroll_sheet_pcb;

CREATE POLICY psp_read ON payroll_sheet_pcb FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);
CREATE POLICY psp_write ON payroll_sheet_pcb FOR ALL
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

COMMIT;
