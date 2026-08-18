-- 131: corrections to a payroll year, after the fact.
--
-- The yearly sheet is a projection: it computes twelve months plus the 13th
-- from the salary record and the rate table, and every figure follows from
-- those two. That is the right default and it is also the limitation — the
-- moment anything happens that the formula cannot know about, the sheet stops
-- describing what the employee was actually paid.
--
-- SKBBK is the case that proved it. The scheme was announced mid-year and
-- applies from a date already past, so months that were computed correctly at
-- the time are now short. Nothing in the salary record or the rate table can
-- express "and also recover three months of it in September". The same is true
-- of a keying error found in November, a negotiated arrangement, or a refund
-- owed because a deduction was taken twice.
--
-- So: an adjustment is a signed amount, attributed to one named figure, landing
-- in one month, with a reason.
--
-- Attribution to a NAMED FIGURE is the whole point, and it is why this is not
-- another payroll_employee_custom_items row. A custom item moves net pay and
-- says nothing about which scheme it belongs to. Recovering under-deducted
-- SKBBK as a generic "deduction" would pay PERKESO the right total while the
-- PERKESO summary reported the wrong SKBBK figure — the money right and the
-- return wrong, which is the failure that costs the church a penalty. An
-- adjustment carrying category = 'SKBBK' lands in the SKBBK column of the
-- yearly sheet, the payslip and PERKESO's own summary at once.

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,

  -- The month the adjustment LANDS in — the payslip that carries it. 13 is the
  -- 13th month, matching payroll_employee_custom_items.
  year        INT NOT NULL,
  month       INT NOT NULL CHECK (month BETWEEN 1 AND 13),

  -- Which figure this moves. Every value here is a column of the yearly sheet,
  -- so an adjustment always has somewhere to show itself.
  --
  --   GROSS     back pay or a gross correction
  --   PCB       tax withheld
  --   EPF_EE / EPF_ER
  --   SOCSO_EE / SOCSO_ER
  --   SKBBK     employee only — the scheme has no employer side
  --   EIS_EE / EIS_ER
  --   NET       a payment or recovery that belongs to no scheme: an ex gratia
  --             sum, a negotiated arrangement, money advanced and clawed back
  category    TEXT NOT NULL CHECK (category IN (
                'GROSS','PCB','EPF_EE','EPF_ER','SOCSO_EE','SOCSO_ER',
                'SKBBK','EIS_EE','EIS_ER','NET')),

  -- Signed, and it always means the same thing: what to ADD to the named
  -- figure. +50 of SKBBK is fifty more deducted; -50 is fifty refunded. One
  -- rule for every category, so there is nothing to remember per category —
  -- what it does to take-home follows from what the figure is, and the form
  -- spells that out in words before anything is saved.
  amount      DECIMAL(12,2) NOT NULL CHECK (amount <> 0),

  reason      TEXT NOT NULL,

  -- Which period went wrong, when the adjustment is fixing an earlier month
  -- rather than describing this one. Null for anything that simply belongs to
  -- the month it lands in. Recorded because "why is September's SKBBK three
  -- times the usual figure" is asked at audit, long after everyone has
  -- forgotten, and the reason text alone rarely survives that gap.
  origin_year  INT,
  origin_month INT CHECK (origin_month IS NULL OR origin_month BETWEEN 1 AND 13),

  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reason_not_blank CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_payroll_adj_lookup
  ON payroll_adjustments (employee_id, year, month);

-- What a finalized run actually carried.
--
-- Adjustments are editable, and a run already snapshots gross, every statutory
-- figure and custom_items rather than recomputing. Leaving adjustments out
-- would let a correction typed in December silently rewrite what August's
-- payslip says was paid.
ALTER TABLE payroll_lines
  ADD COLUMN IF NOT EXISTS adjustments JSONB NOT NULL DEFAULT '[]';

COMMENT ON TABLE payroll_adjustments IS
  'Signed corrections to one named payroll figure, landing in one month. Attribution to a category is what keeps the statutory returns right, not just the net pay.';
COMMENT ON COLUMN payroll_lines.adjustments IS
  'Adjustments as they stood when the run was finalized. A later edit must not rewrite a payslip already issued.';

ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_adj_read"  ON payroll_adjustments;
DROP POLICY IF EXISTS "payroll_adj_write" ON payroll_adjustments;

-- The house pattern for anything scoped to one employee: Finance runs payroll,
-- and a person may see their own. Their own matters here more than most —
-- an adjustment changes what they are paid and shows on their payslip, so
-- withholding it would leave them unable to check a figure that is about them.
-- Deliberately not can_oversee_payroll(): that is the signatories, and they
-- read runs and the audit log, not the line-by-line corrections behind them.
CREATE POLICY "payroll_adj_read" ON payroll_adjustments FOR SELECT TO authenticated
  USING (can_manage_payroll() OR employee_id = my_payroll_employee_id());
CREATE POLICY "payroll_adj_write" ON payroll_adjustments FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_adjustments TO authenticated;
