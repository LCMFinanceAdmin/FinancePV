-- 263 — EIS covers citizens and permanent residents. Nothing said who was.
--
-- The Employment Insurance System Act 800 covers Malaysian citizens and
-- permanent residents. A foreign national is outside it entirely, and no part
-- of the payroll knew the difference — so every foreign employee was deducted
-- EIS and LCM remitted an employer share against it, on a scheme that will
-- never pay out to them.
--
-- It had been worked around by hand. One employee carries sixteen corrections
-- for 2026 alone, two a month, each reading "Foreigner" — and they would have
-- to be keyed again every January, for every year, for as long as she is
-- employed. A correction standing against a rule that never changes is a rule
-- the system should hold.
--
-- Deliberately narrow. This governs EIS and nothing else:
--
--   SOCSO    — foreign workers other than domestic servants have been covered
--              since January 2019, employment injury only. Whether LCM has
--              been contributing on that basis or on Category 1 is a question
--              for Finance and PERKESO, not for a migration, so SOCSO is left
--              exactly as it is and the difference reported instead.
--   EPF      — a foreign employee may elect to contribute, and LCM's figures
--              show the ordinary rates being paid. Left alone for the same
--              reason.
--
-- A permanent resident is NOT a foreigner here: EIS covers them. The flag
-- means "neither a citizen nor a PR".

BEGIN;

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS is_foreigner BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN payroll_employees.is_foreigner IS
  'Neither a Malaysian citizen nor a permanent resident. EIS (Act 800) covers '
  'citizens and PRs only, so nothing is contributed either side for somebody '
  'flagged here. A permanent resident is NOT a foreigner for this purpose. '
  'Governs EIS alone — SOCSO and EPF are unchanged by it. See migration 263.';

COMMIT;
