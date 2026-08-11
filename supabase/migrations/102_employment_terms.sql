-- 102: The terms someone was employed on.
--
-- payroll_salary already versions every revision, which is what makes an
-- increment or a salary change traceable. What it could not record is *why the
-- terms are what they are*: a special arrangement agreed when someone was
-- taken on, and the Bishop's approval of it.
--
-- Those belong on the salary revision rather than the employee, because a
-- later arrangement supersedes an earlier one and the earlier one still has to
-- be readable — the same reason the salary itself is versioned.

ALTER TABLE payroll_salary
  ADD COLUMN IF NOT EXISTS special_arrangement TEXT,
  -- Who agreed these terms. Usually the Bishop, on appointment.
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_on DATE;

COMMENT ON COLUMN payroll_salary.special_arrangement IS
  'Any arrangement outside the standard terms, as agreed when these terms were set';
COMMENT ON COLUMN payroll_salary.approved_by IS
  'Who approved these terms — the Bishop on appointment, or whoever authorised a later revision';

-- Set once, when the record was created, so the directory can say "employed
-- from" without inferring it from the earliest salary row.
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pe_person ON payroll_employees(person_id);

-- Close the loop on records already linked from the directory side, so the
-- join works in both directions.
UPDATE payroll_employees pe
   SET person_id = p.id
  FROM people p
 WHERE p.payroll_employee_id = pe.id
   AND pe.person_id IS NULL;
