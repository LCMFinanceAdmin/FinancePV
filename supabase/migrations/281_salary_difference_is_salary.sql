-- 281: one recurring item marked as part of the gross.
--
-- EMP-188 carries a recurring allowance labelled as a salary difference for
-- 2024 and 2025. It was keyed before migration 280 existed, so it defaulted
-- to sitting outside the gross — which is right for COLA, the case these
-- items were built for, and wrong for this one. A salary difference is wages
-- that arrived late.
--
-- Outside the gross it carries no EPF on either side, no SOCSO, no EIS, and
-- is not declared for PCB. Inside it, all four follow it. That is the point
-- of the change and it is not a display setting: it alters what is owed to
-- three statutory boards from the month the item starts.
--
-- Safe to apply now, and this is why: no payroll line exists for this
-- employee in any run, finalised or draft. Nothing already paid is restated,
-- because nothing has been paid through the system. Checked below rather
-- than assumed — if a line has appeared since, this refuses and says so,
-- because a finalised run keeps its own figures and the sheet would then
-- disagree with what was filed.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM payroll_lines l
    JOIN payroll_employees e ON e.id = l.employee_id
   WHERE e.emp_no = 'EMP-188';
  IF n > 0 THEN
    RAISE EXCEPTION
      'This employee now has % payroll line(s). Marking the item as part of the gross would make the sheet disagree with what was filed — decide what to do about those months first.', n;
  END IF;
END $$;

UPDATE payroll_employee_custom_items c
   SET in_gross = true
  FROM payroll_employees e
 WHERE e.id = c.employee_id
   AND e.emp_no = 'EMP-188'
   AND c.label ILIKE 'Salary Difference%'
   AND c.in_gross = false;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM payroll_employee_custom_items c
    JOIN payroll_employees e ON e.id = c.employee_id
   WHERE e.emp_no = 'EMP-188' AND c.label ILIKE 'Salary Difference%' AND c.in_gross;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one item to be marked, found %.', n;
  END IF;
END $$;

INSERT INTO payroll_audit_log (action, entity, employee_id, detail, actor)
SELECT 'PAY_ITEM_UPDATED', c.label, c.employee_id,
       'Marked as part of the gross. It is a salary difference — wages owed for an '
       || 'earlier period — so EPF, SOCSO, EIS and PCB are now worked out on it, from '
       || 'the month it starts. It had been outside the gross only because it was keyed '
       || 'before there was a way to say otherwise. Migration 281.',
       'claude-code (approved by the user)'
  FROM payroll_employee_custom_items c
  JOIN payroll_employees e ON e.id = c.employee_id
 WHERE e.emp_no = 'EMP-188' AND c.label ILIKE 'Salary Difference%';

COMMIT;
