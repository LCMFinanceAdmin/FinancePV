-- 278: the experience bonus runs from commencement, not from the day it was
-- keyed.
--
-- WHAT HAPPENED. The salary records carried one row per person, effective
-- 1 August 2026, with the whole figure in base_salary. In mid-November the
-- experience bonus was keyed separately: a second row, dated 16-18 November,
-- with the same gross split differently — some of the basic moved into
-- experience_bonus.
--
-- The money never moved. Every one of the 28 people affected has the same
-- gross on both rows. What changed was the composition, and only from
-- November, so a yearly sheet showed the bonus appearing two months before
-- the year ended on somebody who has had it since the day they started.
--
-- LCM's rule is that the experience bonus runs from commencement. The
-- November date was not a decision; it is when there was finally a box to
-- type it into.
--
-- WHAT THIS DOES. For every employee who has an experience bonus on any
-- salary row, it puts that same bonus on their other rows, taking the same
-- amount out of base_salary so the gross is unchanged to the cent. The
-- composition becomes what it always should have been; nothing anybody was
-- paid is touched.
--
-- WHAT IT DOES NOT TOUCH, and why that is the whole point:
--
--   * No gross changes. The assertion at the bottom fails the migration if
--     one does, and it is checked per row rather than in total — two errors
--     that cancel would pass a sum.
--   * Therefore no EPF, SOCSO, EIS, SKBBK or PCB figure changes. All of them
--     are worked out on the gross.
--   * Finalised payroll runs store their own line figures and are not read
--     from here, so nothing already paid is restated.
--
-- The one thing it does change, besides the sheet: a payslip regenerated for
-- an earlier month will now itemise the bonus instead of folding it into the
-- basic. That is the correction, printed.
--
-- Three people are deliberately left as they are, because they are already
-- right: KUANG KAR LOONG and ANDRY A/L ALANG carry the bonus on every row
-- already. KUNASEKAR PALRAS is the same fault in the other direction — his
-- 2021 row has it and his 2026 row lost it — and is corrected by the same
-- rule, which is why the rule is written as "every row gets the bonus the
-- record holds" rather than "the later row wins".

BEGIN;

-- The bonus each person's record holds. Checked first for the one thing that
-- would make a single answer wrong: two different non-zero figures on one
-- person, which would mean the bonus itself had been revised and this is not
-- a re-keying at all.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT employee_id FROM payroll_salary
     WHERE experience_bonus > 0
     GROUP BY employee_id
    HAVING count(DISTINCT experience_bonus) > 1
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION
      '% employee(s) hold two different experience bonuses. That is a revision, not a re-keying, and this migration would flatten it.', n;
  END IF;
END $$;

CREATE TEMP TABLE exp_canonical AS
SELECT employee_id, MAX(experience_bonus) AS bonus
  FROM payroll_salary
 WHERE experience_bonus > 0
 GROUP BY employee_id;

-- Nobody's basic may go negative. It cannot on today's figures — the largest
-- bonus is 450 against basics in the thousands — but a migration that would
-- quietly write a negative salary should say so instead.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM payroll_salary s JOIN exp_canonical c ON c.employee_id = s.employee_id
   WHERE s.experience_bonus <> c.bonus
     AND s.base_salary - (c.bonus - s.experience_bonus) < 0;
  IF n > 0 THEN
    RAISE EXCEPTION '% row(s) would be left with a negative basic.', n;
  END IF;
END $$;

CREATE TEMP TABLE exp_before AS
SELECT s.id,
       (s.base_salary + s.increment_carried + s.increment_current
         + s.experience_bonus + s.family_allowance + s.stm_allowance) AS gross
  FROM payroll_salary s
 WHERE s.employee_id IN (SELECT employee_id FROM exp_canonical);

UPDATE payroll_salary s
   SET base_salary     = s.base_salary - (c.bonus - s.experience_bonus),
       experience_bonus = c.bonus
       -- No updated_at on this table: a salary row is a record of a decision
       -- and is not meant to be edited, which is itself the reason the audit
       -- entry below is written.
  FROM exp_canonical c
 WHERE c.employee_id = s.employee_id
   AND s.experience_bonus <> c.bonus;

-- Per row, not in total: two errors that cancel would pass a sum.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM exp_before b
    JOIN payroll_salary s ON s.id = b.id
   WHERE round(b.gross, 2) <> round(
     s.base_salary + s.increment_carried + s.increment_current
       + s.experience_bonus + s.family_allowance + s.stm_allowance, 2);
  IF n > 0 THEN
    RAISE EXCEPTION 'THE GROSS MOVED ON % ROW(S). Nothing has been committed.', n;
  END IF;
END $$;

INSERT INTO payroll_audit_log (action, entity, employee_id, detail, actor)
SELECT 'SALARY_CHANGE', e.full_name, e.id,
       'Experience bonus of ' || to_char(c.bonus, 'FM999G999D00')
       || ' put on every salary row, as it runs from commencement rather than from '
       || 'the day it was keyed. The same amount came out of base salary, so the gross '
       || 'is unchanged and no statutory figure moves — only how the sheet and a payslip '
       || 'itemise it. Migration 278.',
       'claude-code (approved by the user)'
  FROM exp_canonical c
  JOIN payroll_employees e ON e.id = c.employee_id;

COMMIT;
