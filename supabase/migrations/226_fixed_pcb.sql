-- 226: a fixed monthly PCB, kept against the person.
--
-- PCB has always been keyed into the run by hand, one figure per employee per
-- month. That is right where PCB genuinely varies, and wrong for LCM, whose
-- deductions are fixed monthly amounts agreed with LHDN — eighty-one of them,
-- retyped every month, each one a chance to fat-finger somebody's tax.
--
-- This is the default, not the answer. The run still shows an editable box and
-- still stores whatever is in it, so a month that legitimately differs — a
-- bonus month, a mid-year revision — is typed over the top exactly as before.
-- What changes is that the box arrives filled in.
--
-- Deliberately not on payroll_salary. A salary record is a version of what
-- somebody is paid, written afresh each time it changes; PCB is a standing
-- instruction that outlives any particular salary row, and putting it there
-- would mean re-entering it every time anybody got a raise.

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS fixed_pcb NUMERIC(12,2);

COMMENT ON COLUMN payroll_employees.fixed_pcb IS
  'Standing monthly PCB for this employee, in RM. Pre-fills the payroll run; '
  'the run remains editable and stores what was actually used. NULL means '
  'there is no standing figure and PCB is keyed per month as before.';
