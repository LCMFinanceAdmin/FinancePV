-- 261 — Two facts the payroll could not record.
--
-- 1. CONFIRMATION. A staff member starts on a probation salary and moves to a
--    confirmed one. The salary history already holds both figures, because it
--    is versioned — what it does not hold is which side of confirmation each
--    row sits on. So a yearly sheet reading 3,800 for three months and 4,000
--    thereafter looks indistinguishable from a mistake, and the only way to
--    know otherwise is to ask somebody who remembers.
--
--    One date settles it. Everything else is derived: the rows before it are
--    the probation salary, the row from it is the confirmed one, and a
--    confirmation date that has passed with no salary row against it is a
--    confirmation nobody has actioned.
--
-- 2. THE MONTH NOBODY MAY SKIP. SKBBK (Lindung 24) opened in June 2026 with
--    everyone enrolled; leaving it takes effect afterwards, not retroactively.
--    Until now `skbbk_opted_out` was absolute, so ticking it emptied June as
--    well — a month that was deducted, remitted and filed. The rate row now
--    carries the last month of compulsory enrolment, and an opt-out is honoured
--    only after it.

-- ── 1. Confirmation ──────────────────────────────────────────────────────
alter table payroll_employees
  add column if not exists confirmed_on date;

comment on column payroll_employees.confirmed_on is
  'The date confirmation takes effect. Salary rows before it are the probation '
  'salary; the row effective on or after it is the confirmed one. May be set in '
  'advance — it is the date on the letter, not the date it was keyed. NULL where '
  'confirmation does not apply or was never recorded.';

-- ── 2. The compulsory months of a scheme ─────────────────────────────────
alter table payroll_statutory_rates
  add column if not exists skbbk_mandatory_to_month integer;

comment on column payroll_statutory_rates.skbbk_mandatory_to_month is
  'The last month of this year in which SKBBK is compulsory for everyone, '
  'opt-out or not. Counts from the scheme start (skbbk_from_month), never before '
  'it. NULL means an opt-out is honoured all year. 2026 = 6: the scheme opened '
  'in June with everybody enrolled, and leaving it bites from July.';

update payroll_statutory_rates
   set skbbk_mandatory_to_month = 6
 where year = 2026
   and skbbk_mandatory_to_month is null;
