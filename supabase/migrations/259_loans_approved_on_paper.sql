-- Loans approved before the system, recorded so the payroll can track them.
--
-- The church has EPLs running that were agreed and signed on paper. The
-- application flow here cannot take them: a loan only becomes ACTIVE once the
-- applicant, the Bishop and the Treasurer have each signed ON SCREEN, or once
-- a General Manager and a signatory have each approved on screen. Neither
-- happened for a paper loan, and clicking through them to make the deduction
-- start would put signatures in the record that nobody gave.
--
-- So a loan can now be recorded as what it is: a decision taken elsewhere.
-- These three columns say that out loud and carry the paper trail — when it
-- was approved and by whom — and the Loans screen marks such a loan so it is
-- never read as having been approved in the app.
--
-- Nothing else changes. Once ACTIVE with a start month, the existing schedule
-- in lib/payroll/loan.ts fills the EPL column of every year the loan runs
-- through, past years included, and stops at the end of the term. That is
-- already how the yearly sheet reads a loan — installmentForMonth, not the
-- recorded repayments — so a loan keyed with its original terms needs no
-- backfilling to show correctly in the years it has already been repaid over.

BEGIN;

ALTER TABLE employee_loans
  ADD COLUMN IF NOT EXISTS approved_outside     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_outside_on  date,
  ADD COLUMN IF NOT EXISTS approved_outside_by  text;

COMMENT ON COLUMN employee_loans.approved_outside IS
  'True where the loan was approved on paper and recorded here for tracking. '
  'Such a loan has no in-app signatures and must never be shown as if it had.';
COMMENT ON COLUMN employee_loans.approved_outside_on IS
  'The date the paper approval was given — not the date it was keyed.';
COMMENT ON COLUMN employee_loans.approved_outside_by IS
  'Who approved it on paper, as written on the agreement.';

-- A loan claiming an outside approval has to say when and by whom, or the
-- claim is worth nothing. Added NOT VALID so the column default cannot fail
-- against rows that predate it; there are none today, and this keeps it safe
-- to run on a database where there are.
ALTER TABLE employee_loans DROP CONSTRAINT IF EXISTS employee_loans_outside_needs_a_record;
ALTER TABLE employee_loans ADD CONSTRAINT employee_loans_outside_needs_a_record
  CHECK (
    NOT approved_outside
    OR (approved_outside_on IS NOT NULL AND coalesce(btrim(approved_outside_by), '') <> '')
  ) NOT VALID;

COMMIT;
