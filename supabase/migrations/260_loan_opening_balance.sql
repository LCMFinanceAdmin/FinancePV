-- What was repaid on a loan before this system started tracking it.
--
-- A loan recorded under migration 259 is keyed with its ORIGINAL amount, so
-- the yearly sheet can fill in the instalments for every year it has already
-- run through. That is right for the sheet and wrong for the balance: the
-- outstanding figure is worked out from repayments on record, and a loan
-- agreed in 2025 has none, so it reads as though nothing had ever been repaid.
-- Quote that balance to somebody and it overstates their debt by however much
-- they have already paid.
--
-- So one repayment row can stand for everything paid before the system: a
-- single opening entry carrying the total, dated to the last month it covers.
-- outstandingBalance() in lib/payroll/loan.ts sums every repayment against the
-- principal and needs no change to read it.
--
-- The flag is what keeps it honest. Without it this row is indistinguishable
-- from a monthly deduction the payroll actually made, and the repayment
-- history would show a month in which somebody paid five thousand ringgit.
-- With it, the screens can show it for what it is — a brought-forward figure
-- from the paper record — and nothing counts it as a run.

BEGIN;

ALTER TABLE loan_repayments
  ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note       text;

COMMENT ON COLUMN loan_repayments.is_opening IS
  'True for the single brought-forward row standing for everything repaid '
  'before this system tracked the loan. Never produced by a payroll run.';
COMMENT ON COLUMN loan_repayments.note IS
  'Why this repayment exists, where it was not made by a run.';

-- An opening entry belongs to no run, and there is at most one per loan.
-- Both are what make it safe for outstandingBalance() to simply add it up.
ALTER TABLE loan_repayments DROP CONSTRAINT IF EXISTS loan_repayments_opening_has_no_run;
ALTER TABLE loan_repayments ADD CONSTRAINT loan_repayments_opening_has_no_run
  CHECK (NOT is_opening OR payroll_run_id IS NULL) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS loan_repayments_one_opening_per_loan
  ON loan_repayments (loan_id) WHERE is_opening;

COMMIT;
