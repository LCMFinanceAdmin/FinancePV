-- 229: an employee aged 60 or over who keeps contributing to EPF.
--
-- Turning 60 does not end somebody's EPF. It makes their own half of it a
-- choice: step out and the employer alone pays, at the over-60 rate; stay in
-- and both sides carry on at the ordinary rate. The calculation had no way to
-- hear that choice, so it assumed everyone stepped out — and for thirteen of
-- the twenty-three people this affects, that was simply wrong, understating
-- what they put away and what the church pays alongside it.
--
-- Default false because stepping out is what happens when nobody says
-- anything, and because the alternative — defaulting everyone in — would
-- start deducting 11% from people who never asked for it.
--
-- This is a record of a decision an employee made, not a rate. The rates are
-- unchanged and stay in the rate config where they can be seen.

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS epf_over60_contributing BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN payroll_employees.epf_over60_contributing IS
  'Aged 60+ and has chosen to keep making their own EPF contribution. Read '
  'only at 60 and over; below 60 contributing is not optional. At 75 EPF '
  'closes to both sides and this is ignored.';
