-- 157: one person, one payroll record, one link.
--
-- Both columns already existed — payroll_employees.person_id and
-- people.payroll_employee_id — and neither was ever populated. Every payroll
-- employee was a second, unconnected record of somebody the directory already
-- knew, which is why the two screens disagreed: "Jermaine Aaron" in the
-- directory and "Jermaine Aaron Jayaraj" on payroll are the same man, and
-- nothing said so.
--
-- Two pointers for one relationship is the thing that goes wrong here, so only
-- one of them is written by hand. payroll_employees.person_id is the record;
-- people.payroll_employee_id is kept in step by the trigger below. The same
-- derived-not-typed shape as districts.dean_email and congregations'
-- council_president_email.
--
-- Deliberately no fuzzy backfill of the two existing employees. Matching them
-- would mean guessing from a name that does not match and an IC the directory
-- never recorded, and linking the wrong two records is worse than leaving them
-- apart — the payroll form now offers the link so a person can confirm it.

-- One payroll record per person. Without this, two payroll rows can each claim
-- the same person and the derived column can only point at one of them.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_employees_person_unique
  ON payroll_employees (person_id) WHERE person_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_payroll_person_link()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The person stays; they are simply no longer on payroll. is_employed is
    -- left alone on purpose — somebody can be employed without a payroll record
    -- having been set up yet, and clearing it here would drop them out of staff
    -- lists for a reason that has nothing to do with employment.
    UPDATE people SET payroll_employee_id = NULL
     WHERE payroll_employee_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Pointed at somebody else now: release whoever it used to be.
  IF TG_OP = 'UPDATE' AND OLD.person_id IS DISTINCT FROM NEW.person_id
     AND OLD.person_id IS NOT NULL THEN
    UPDATE people SET payroll_employee_id = NULL
     WHERE id = OLD.person_id AND payroll_employee_id = OLD.id;
  END IF;

  IF NEW.person_id IS NOT NULL THEN
    -- Anybody else still claiming this payroll record is stale by definition.
    UPDATE people SET payroll_employee_id = NULL
     WHERE payroll_employee_id = NEW.id AND id <> NEW.person_id;

    UPDATE people
       SET payroll_employee_id = NEW.id,
           is_employed = TRUE,
           updated_at = NOW()
     WHERE id = NEW.person_id
       AND payroll_employee_id IS DISTINCT FROM NEW.id;
  ELSE
    UPDATE people SET payroll_employee_id = NULL
     WHERE payroll_employee_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_person_link ON payroll_employees;
CREATE TRIGGER trg_payroll_person_link
  AFTER INSERT OR DELETE OR UPDATE OF person_id ON payroll_employees
  FOR EACH ROW EXECUTE FUNCTION sync_payroll_person_link();

-- Repair anything the two columns already disagree about. There is nothing to
-- repair today — both sides are empty — but this migration is the moment the
-- rule starts being enforced, and a link written before it by the Employment
-- panel would otherwise sit outside the rule.
UPDATE people p SET payroll_employee_id = NULL
 WHERE p.payroll_employee_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM payroll_employees pe
      WHERE pe.id = p.payroll_employee_id AND pe.person_id = p.id
   );

UPDATE people p SET payroll_employee_id = pe.id, is_employed = TRUE
  FROM payroll_employees pe
 WHERE pe.person_id = p.id
   AND p.payroll_employee_id IS DISTINCT FROM pe.id;

COMMENT ON COLUMN payroll_employees.person_id IS
  'The directory record this employee is. The link is written here; people.payroll_employee_id follows by trigger.';
COMMENT ON COLUMN people.payroll_employee_id IS
  'Derived from payroll_employees.person_id by trigger — do not write directly.';
