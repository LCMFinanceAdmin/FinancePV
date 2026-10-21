-- What a qualification is worth
--
-- LCM pays a base salary determined by the qualification somebody holds, and
-- raises it when they gain a higher one. Until now nothing recorded either
-- half of that: a salary revision was a number typed into a box with a
-- sentence of free text beside it, so whether two people with the same
-- qualification were on the same base salary depended on whoever last did the
-- arithmetic remembering what the policy said.
--
-- Two tables and two columns.
--
--   qualifications            the ladder, in rank order. Ranks are not unique,
--                             because two awards can sit at the same step --
--                             a Master of Divinity and a Master of Ministry
--                             need not be ranked against each other.
--
--   qualification_salary_points  what each rung is worth, dated. The scale is
--                             revised from time to time and the old figure has
--                             to stay readable, so a point is effective from a
--                             date and the one in force is the latest on or
--                             before the day in question -- the same shape as
--                             payroll_salary itself.
--
--   payroll_employees.qualification_code  what somebody holds now.
--   payroll_salary.qualification_code     what justified that salary row, so
--                             the salary history is also the record of when
--                             somebody's qualification changed and what it did
--                             to their pay.
--
-- No figures are seeded here. The scale is LCM policy, not something to be
-- inferred from the salaries already in the table, and payroll amounts do not
-- belong in a migration in any case. Both tables arrive empty and are filled
-- in from Payroll -> Salary scale.

BEGIN;

CREATE TABLE IF NOT EXISTS qualifications (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  -- Where it sits on the ladder. Higher is further up; equal is equal.
  rank        INTEGER NOT NULL,
  -- Kept rather than deleted once it has been used, so that an old salary row
  -- still says what it was based on.
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  note        TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE qualifications IS
  'The ladder of qualifications LCM recognises for pay. Ranks are not unique: '
  'two awards may sit at the same step.';

CREATE TABLE IF NOT EXISTS qualification_salary_points (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_code TEXT NOT NULL REFERENCES qualifications(code) ON DELETE CASCADE,
  base_salary        NUMERIC NOT NULL CHECK (base_salary >= 0),
  effective_from     DATE NOT NULL,
  note               TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One figure per rung per date. Revising the scale for a date already set
  -- is an edit of that row, not a second opinion sitting beside the first.
  UNIQUE (qualification_code, effective_from)
);

COMMENT ON TABLE qualification_salary_points IS
  'What each rung of the ladder is worth, effective from a date. The point in '
  'force is the latest on or before the day in question.';

CREATE INDEX IF NOT EXISTS idx_qual_points_lookup
  ON qualification_salary_points (qualification_code, effective_from DESC);

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS qualification_code TEXT REFERENCES qualifications(code);

COMMENT ON COLUMN payroll_employees.qualification_code IS
  'The highest qualification this person holds, which sets their base salary.';

ALTER TABLE payroll_salary
  ADD COLUMN IF NOT EXISTS qualification_code TEXT REFERENCES qualifications(code);

COMMENT ON COLUMN payroll_salary.qualification_code IS
  'The qualification this salary was set against. Null for rows recorded '
  'before the scale existed, and for salaries not set by qualification.';

-- ---------------------------------------------------------------------------
-- Who may see and set it
--
-- The ladder is a list of names and may be read by anybody signed in, because
-- a payslip or a person's own record may want to say what they hold. The
-- figures are another matter: the scale says what every holder of a
-- qualification earns, so reading it is reading most of the payroll. That
-- stays with the people who run payroll.
-- ---------------------------------------------------------------------------
ALTER TABLE qualifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualification_salary_points   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qual_read  ON qualifications;
DROP POLICY IF EXISTS qual_write ON qualifications;
CREATE POLICY qual_read  ON qualifications FOR SELECT USING (NOT is_guest());
CREATE POLICY qual_write ON qualifications FOR ALL    USING (can_manage_payroll())
                                                      WITH CHECK (can_manage_payroll());

DROP POLICY IF EXISTS qsp_read  ON qualification_salary_points;
DROP POLICY IF EXISTS qsp_write ON qualification_salary_points;
CREATE POLICY qsp_read  ON qualification_salary_points FOR SELECT USING (can_manage_payroll());
CREATE POLICY qsp_write ON qualification_salary_points FOR ALL    USING (can_manage_payroll())
                                                                  WITH CHECK (can_manage_payroll());

COMMIT;
