-- 285: what PTPTN lent, recorded beside what is left of it.
--
-- A PTPTN direction held two figures: the instalment, and the balance PTPTN
-- last advised. Finance asked for a third — the loan itself — so the record
-- reads the way a staff loan does: what was borrowed, what is being paid, what
-- is left.
--
-- Reference only, and deliberately so. NOTHING is computed from it. The
-- deduction runs off the instalment and counts down from the advised balance,
-- for the reason the whole PTPTN module is built around: LCM is not the
-- lender. PTPTN lends, the employee borrows, LCM is directed to deduct and
-- remit. The gap between the loan and the balance is repayments LCM did not
-- make and interest LCM does not compute, so inferring anything from this
-- figure would be inventing it.
--
-- Nullable, because it is often not on the letter. A direction without it
-- works exactly as it did before.

BEGIN;

ALTER TABLE employee_ptptn
  ADD COLUMN IF NOT EXISTS loan_amount numeric(12,2)
  CONSTRAINT employee_ptptn_loan_amount_positive CHECK (loan_amount IS NULL OR loan_amount >= 0);

COMMENT ON COLUMN employee_ptptn.loan_amount IS
  'What PTPTN lent, where it is known. Reference only — the deduction is '
  'worked out from monthly_amount and counts down from opening_balance, '
  'which is what PTPTN last advised. Nothing is derived from this column, '
  'because the difference between it and the balance is repayments LCM did '
  'not make and interest LCM does not compute.';

COMMIT;
