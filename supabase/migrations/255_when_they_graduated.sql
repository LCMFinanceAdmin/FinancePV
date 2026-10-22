-- When they graduated
--
-- The scale said what a qualification is worth and the salary history said
-- when somebody started being paid for it, but nothing said when they got it.
-- Those are different dates and the gap between them is the thing that goes
-- wrong: somebody graduates in March, the certificate reaches the office in
-- October, and by then there is nothing on record to say the rise should have
-- run from March rather than from the day somebody finally typed it in.
--
-- Two columns.
--
--   payroll_employees.qualification_on  when they attained what they now hold.
--   payroll_salary.qualification_on     the date behind that salary row, so
--                                       the history shows both — graduated the
--                                       fifteenth, paid from the first of the
--                                       following month — rather than leaving
--                                       a reader to wonder which the effective
--                                       date was meant to be.
--
-- A date with no qualification beside it says nothing, so it is refused. A
-- qualification with no date is allowed: most of the directory predates this,
-- and demanding a date nobody has would mean inventing one.

BEGIN;

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS qualification_on DATE;

ALTER TABLE payroll_salary
  ADD COLUMN IF NOT EXISTS qualification_on DATE;

COMMENT ON COLUMN payroll_employees.qualification_on IS
  'When the qualification now held was attained. Null where it is not known.';
COMMENT ON COLUMN payroll_salary.qualification_on IS
  'The date behind this salary row, so the history shows when somebody '
  'graduated as well as when they started being paid for it.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pe_qualification_date_needs_a_qualification') THEN
    ALTER TABLE payroll_employees
      ADD CONSTRAINT pe_qualification_date_needs_a_qualification
      CHECK (qualification_on IS NULL OR qualification_code IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_qualification_date_needs_a_qualification') THEN
    ALTER TABLE payroll_salary
      ADD CONSTRAINT ps_qualification_date_needs_a_qualification
      CHECK (qualification_on IS NULL OR qualification_code IS NOT NULL);
  END IF;
END $$;

COMMIT;
