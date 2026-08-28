-- 187: a start date cannot precede a birth date.
--
-- EMP-018 arrived with date_commenced equal to his date of birth, and it came
-- that way from the church's payroll software, which had already computed
-- "72 years of service" from it. 185 cleared it and 186 recorded the true date,
-- 1 March 1985 — but the source system has not been corrected, and until it is,
-- the next import brings the same value back.
--
-- Nothing in this app can reach that system. What it can do is refuse to hold
-- the value. A person starting work on or before the day they were born is not
-- an edge case to be tolerated; it is always an error, so this is a constraint
-- and not a warning. An import carrying it will fail loudly and name the row,
-- which is the behaviour that would have caught this in the first place —
-- instead it passed silently and was found eight migrations later by eye.
--
-- Deliberately the weakest rule that is still unarguable: strictly after birth.
-- A minimum working age would catch more, but it would also invite a fight
-- about what that age is, and any such rule can be wrong about somebody.

ALTER TABLE payroll_employees
  DROP CONSTRAINT IF EXISTS payroll_start_after_birth;
ALTER TABLE payroll_employees
  ADD CONSTRAINT payroll_start_after_birth
  CHECK (date_commenced IS NULL OR dob IS NULL OR date_commenced > dob);

ALTER TABLE people
  DROP CONSTRAINT IF EXISTS people_joined_after_birth;
ALTER TABLE people
  ADD CONSTRAINT people_joined_after_birth
  CHECK (date_joined IS NULL OR dob IS NULL OR date_joined > dob);

-- Both constraints are validated against existing rows on creation, so if this
-- migration runs at all, nothing already stored breaks them.
SELECT (SELECT count(*) FROM payroll_employees WHERE date_commenced IS NOT NULL) AS payroll_dates_held,
       (SELECT count(*) FROM people WHERE date_joined IS NOT NULL)               AS directory_dates_held;
