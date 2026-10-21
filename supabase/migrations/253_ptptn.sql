-- PTPTN: a deduction LCM collects and hands on
--
-- PTPTN appeared nowhere in this system, so the deductions sat in the old
-- payroll software and could not be imported. It needs somewhere of its own.
--
-- Not a staff loan. employee_loans is an LCM lending agreement -- a loan
-- number, a principal LCM advanced, a term LCM set, an approval, a signature,
-- a signed agreement on file. PTPTN is none of that. LCM did not lend the
-- money and does not set the terms: it is directed to deduct an amount from
-- somebody's salary and remit it. Putting it in the loan table would mean
-- inventing loan numbers and approvals that never happened, and PTPTN would
-- then appear in LCM's own loan register and loan reports, where it is not a
-- loan LCM has made.
--
-- The important difference from a loan is what LCM knows. With a staff loan
-- the principal is LCM's own figure and the outstanding balance follows from
-- it exactly. With PTPTN the borrower is the employee and the lender is
-- PTPTN; LCM knows only what it has been told and what it has since deducted.
-- So the balance here is explicitly "what PTPTN last advised, and when", and
-- everything derived from it is LCM's record since that date rather than the
-- borrower's true position. Where nothing has been advised the balance is
-- null and stays null -- an unknown balance is reported as unknown rather
-- than guessed from the deductions, because a number on a payslip is taken as
-- fact by the person reading it.
--
-- No amounts are seeded here. These arrive empty and are filled in from the
-- payroll pages, and payroll figures do not belong in a migration.

BEGIN;

CREATE TABLE IF NOT EXISTS employee_ptptn (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES payroll_employees(id) ON DELETE CASCADE,
  -- PTPTN's own reference on the direction to deduct.
  reference_no    TEXT,
  monthly_amount  NUMERIC NOT NULL CHECK (monthly_amount > 0),

  -- What PTPTN last advised was outstanding, and the day they advised it.
  -- Null together: a balance without a date cannot be reasoned from, and a
  -- date without a balance says nothing.
  opening_balance NUMERIC CHECK (opening_balance IS NULL OR opening_balance >= 0),
  balance_as_at   DATE,
  CONSTRAINT ptptn_balance_needs_a_date
    CHECK ((opening_balance IS NULL) = (balance_as_at IS NULL)),

  started_on      DATE NOT NULL,
  ended_on        DATE,
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'STOPPED', 'COMPLETED')),
  CONSTRAINT ptptn_ended_after_started
    CHECK (ended_on IS NULL OR ended_on >= started_on),

  -- The direction order itself, so the deduction can be answered for.
  direction_url   TEXT,
  direction_name  TEXT,
  note            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE employee_ptptn IS
  'A direction to deduct PTPTN from somebody''s salary and remit it. LCM is '
  'not the lender: the balance is what PTPTN advised, as at the day advised.';

-- One direction at a time. Two active ones would deduct twice over, and the
-- person would find out by being short at the end of the month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptptn_one_active_per_employee
  ON employee_ptptn (employee_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS ptptn_deductions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ptptn_id        UUID NOT NULL REFERENCES employee_ptptn(id) ON DELETE CASCADE,
  payroll_run_id  UUID,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL CHECK (month >= 1 AND month <= 13),
  amount          NUMERIC NOT NULL CHECK (amount > 0),
  -- What LCM's record says is left afterwards, or null where PTPTN never
  -- advised a balance to count down from.
  balance_after   NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A month is deducted once. Re-finalising a run deletes its rows first, so
  -- this only ever fires on a genuine second deduction for the same month --
  -- which should stop the payroll rather than quietly take the money twice.
  CONSTRAINT uq_ptptn_one_per_month UNIQUE (ptptn_id, year, month)
);

COMMENT ON TABLE ptptn_deductions IS
  'What was actually deducted, by month. balance_after is LCM''s record since '
  'the day PTPTN advised a balance, not the borrower''s true position.';

CREATE INDEX IF NOT EXISTS idx_ptptn_deductions_lookup
  ON ptptn_deductions (ptptn_id, year, month);
CREATE INDEX IF NOT EXISTS idx_ptptn_deductions_run
  ON ptptn_deductions (payroll_run_id);

-- ---------------------------------------------------------------------------
-- Who may see it
--
-- The same shape as the staff loans beside it: payroll manages it, oversight
-- may read it, and a person may read their own.
-- ---------------------------------------------------------------------------
ALTER TABLE employee_ptptn   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ptptn_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ptptn_read  ON employee_ptptn;
DROP POLICY IF EXISTS ptptn_write ON employee_ptptn;
CREATE POLICY ptptn_read ON employee_ptptn FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);
CREATE POLICY ptptn_write ON employee_ptptn FOR ALL
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

DROP POLICY IF EXISTS ptptn_ded_read  ON ptptn_deductions;
DROP POLICY IF EXISTS ptptn_ded_write ON ptptn_deductions;
CREATE POLICY ptptn_ded_read ON ptptn_deductions FOR SELECT USING (
  can_manage_payroll() OR EXISTS (
    SELECT 1 FROM employee_ptptn p
     WHERE p.id = ptptn_deductions.ptptn_id
       AND p.employee_id = my_payroll_employee_id()
  )
);
CREATE POLICY ptptn_ded_write ON ptptn_deductions FOR ALL
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

COMMIT;
