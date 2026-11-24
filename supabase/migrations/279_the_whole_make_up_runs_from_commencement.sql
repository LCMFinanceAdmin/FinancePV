-- 279: the rest of the make-up runs from commencement too.
--
-- 278 put the experience bonus on every salary row, because it runs from
-- commencement rather than from the November afternoon it was keyed. The
-- check afterwards showed the same fault one column over, and larger: the
-- November re-keying broke the agreed figure into ALL its parts — basic,
-- accumulated increment, this year's increment, experience, allowances — and
-- the August row still holds the whole thing in base_salary.
--
-- 29 people, 58 rows. Same gross on both, a different account of what it is
-- made of. CHAN LIEN THAI is the plainest: August says basic 4,180 and no
-- increment at all; November says basic 2,150 with 2,030 of accumulated
-- increment behind it. She has been here since 2001. The August row is not a
-- different arrangement, it is the same arrangement before anybody had
-- somewhere to type the parts.
--
-- Left alone, the yearly sheet reads 0.00 under "Increment accumulated" for
-- every month up to October and the full figure from November, and the
-- make-up block dates the increment to November — a revision nobody made, on
-- a sheet given to the person it is about.
--
-- SAME GROSS IS THE TEST, and it is what separates this from a pay rise.
-- KUANG KAR LOONG's two rows differ by a real 110 increment and are in no
-- group here, so nothing touches them. Only rows that already agree on what
-- somebody is paid are made to agree on why.
--
-- WHICH ROW WINS. Within one person's rows at one gross: the most itemised,
-- then the most recently created. The first is the point — a row naming five
-- components describes the arrangement and a row naming one does not. The
-- second settles the five groups where two rows are equally itemised, and it
-- settles them deterministically: no two rows of one person at one gross
-- share a created_at.
--
-- Nothing anybody was paid changes. The assertion at the bottom fails the
-- migration per row if a gross moves, and every statutory figure is worked
-- out on the gross.

BEGIN;

CREATE TEMP TABLE sal AS
SELECT s.id, s.employee_id, s.created_at,
       round(s.base_salary + s.increment_carried + s.increment_current
             + s.experience_bonus + s.family_allowance + s.stm_allowance, 2) AS gross,
       (CASE WHEN s.base_salary       <> 0 THEN 1 ELSE 0 END
      + CASE WHEN s.increment_carried <> 0 THEN 1 ELSE 0 END
      + CASE WHEN s.increment_current <> 0 THEN 1 ELSE 0 END
      + CASE WHEN s.experience_bonus  <> 0 THEN 1 ELSE 0 END
      + CASE WHEN s.family_allowance  <> 0 THEN 1 ELSE 0 END
      + CASE WHEN s.stm_allowance     <> 0 THEN 1 ELSE 0 END) AS named
  FROM payroll_salary s;

-- The row that describes the arrangement, per person per gross.
CREATE TEMP TABLE canon AS
SELECT DISTINCT ON (a.employee_id, a.gross)
       a.employee_id, a.gross, a.id AS canon_id,
       s.base_salary, s.increment_carried, s.increment_current,
       s.experience_bonus, s.family_allowance, s.stm_allowance
  FROM sal a JOIN payroll_salary s ON s.id = a.id
 ORDER BY a.employee_id, a.gross, a.named DESC, a.created_at DESC;

CREATE TEMP TABLE before AS SELECT id, gross FROM sal;

UPDATE payroll_salary s
   SET base_salary      = c.base_salary,
       increment_carried = c.increment_carried,
       increment_current = c.increment_current,
       experience_bonus  = c.experience_bonus,
       family_allowance  = c.family_allowance,
       stm_allowance     = c.stm_allowance
  FROM canon c, sal a
 WHERE a.id = s.id
   AND c.employee_id = a.employee_id
   AND c.gross = a.gross
   AND c.canon_id <> s.id;

-- Per row. Two errors that cancel would pass a sum.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM before b JOIN payroll_salary s ON s.id = b.id
   WHERE b.gross <> round(s.base_salary + s.increment_carried + s.increment_current
                          + s.experience_bonus + s.family_allowance + s.stm_allowance, 2);
  IF n > 0 THEN
    RAISE EXCEPTION 'THE GROSS MOVED ON % ROW(S). Nothing has been committed.', n;
  END IF;
END $$;

INSERT INTO payroll_audit_log (action, entity, employee_id, detail, actor)
SELECT 'SALARY_CHANGE', e.full_name, e.id,
       'Earlier salary rows restated to the itemised make-up held on the row of the '
       || 'same gross: basic, accumulated increment, current increment, experience and '
       || 'allowances. The parts were keyed in November 2026 and describe the '
       || 'arrangement from the start, so a sheet no longer reads nil increment until '
       || 'October and the whole of it from November. The gross is unchanged and no '
       || 'statutory figure moves. Migration 279.',
       'claude-code (approved by the user)'
  FROM (SELECT DISTINCT a.employee_id
          FROM sal a JOIN canon c ON c.employee_id = a.employee_id AND c.gross = a.gross
         WHERE c.canon_id <> a.id) t
  JOIN payroll_employees e ON e.id = t.employee_id;

COMMIT;
