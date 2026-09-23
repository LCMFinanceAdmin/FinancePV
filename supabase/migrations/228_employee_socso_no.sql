-- 228: an employee's own SOCSO number.
--
-- The employer has one, on payroll_employers, and it was the only one the
-- schema held. Every employee has one too, and PERKESO's submissions are made
-- against it. Without somewhere to keep it, the number sat in AutoCount and
-- nowhere else, and any filing built from this system would have had to be
-- reconciled by hand against a report nobody here could read.
--
-- Stored as written. A SOCSO number is an identifier, not a quantity, and
-- normalising somebody's identifier to look tidier is how it stops matching
-- the register it came from.

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS socso_no TEXT;

COMMENT ON COLUMN payroll_employees.socso_no IS
  'The employee''s own SOCSO number, as PERKESO records it. The employer''s '
  'number lives on payroll_employers and is a different thing.';
