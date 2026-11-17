-- 262 — Settling a loan before its term.
--
-- A loan that runs its course closes itself: finalize_payroll_run marks it
-- SETTLED the month a deduction takes the balance to zero (migration 254).
-- Every other way a loan ends had nowhere to go.
--
-- Somebody pays the balance off in a lump. Somebody's final instalments come
-- out of a bonus. A loan recorded late is brought forward as already repaid —
-- that one touches no payroll run at all, so nothing was ever going to close
-- it, and it sat ACTIVE with a schedule still printing instalments years past
-- the point the money stopped.
--
-- SETTLED already existed as a status and nothing could reach it by hand. Two
-- columns make it reachable and say what happened, and a flag on the repayment
-- distinguishes the lump that closed the loan from the instalments that did
-- not and from the opening balance brought forward.
--
-- What it does NOT do: unwind anything. A settled loan deducts nothing,
-- because dueFromBalance already refuses any loan that is not ACTIVE, and the
-- repayments already taken stay exactly as they are.

BEGIN;

ALTER TABLE employee_loans
  ADD COLUMN IF NOT EXISTS settled_on   DATE,
  ADD COLUMN IF NOT EXISTS settled_note TEXT;

COMMENT ON COLUMN employee_loans.settled_on IS
  'The date the loan was settled. Instalments from this month on were never '
  'taken: the schedule stops here. NULL while the loan is still running, and '
  'cleared if it is reopened.';

COMMENT ON COLUMN employee_loans.settled_note IS
  'How it was settled — a lump sum, cleared from a bonus, already repaid '
  'before this system. The only account of it there will be.';

ALTER TABLE loan_repayments
  ADD COLUMN IF NOT EXISTS is_settlement BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN loan_repayments.is_settlement IS
  'The one payment that closed the loan ahead of its term, outside any payroll '
  'run. Counts towards the balance exactly like any other repayment — the flag '
  'is so the schedule can show it as the closing line rather than an instalment.';

-- Andrew's 2023 loan: recorded late, brought forward as fully repaid to
-- January 2025, and still ACTIVE because no run ever took the last ringgit.
-- The money is already accounted for by the opening balance, so there is no
-- settlement payment to record — only the fact that it ended.
UPDATE employee_loans
   SET status       = 'SETTLED',
       settled_on   = DATE '2025-01-31',
       settled_note = 'Outstanding settled in full by January 2025, before this system tracked the loan.',
       updated_at   = NOW()
 WHERE loan_no = 'EPL-2026-007'
   AND status = 'ACTIVE';

COMMIT;
