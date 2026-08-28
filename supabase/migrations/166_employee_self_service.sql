-- 166: let people see their own pay.
--
-- The read policies already said an employee may read their own payroll record,
-- their own salary history and their own payroll lines. What they could not
-- read is payroll_runs, so a line came back with no way to tell which month it
-- belonged to or whether it had been finalised. Self-service was one join short
-- of working.
--
-- Two changes, and both fail closed. my_payroll_employee_id() returns NULL for
-- anyone whose login is not linked to a payroll record, and NULL never equals
-- anything, so an unlinked person sees exactly nothing.
--
-- The second change is a tightening rather than a grant: an employee now sees
-- their line only once the run is FINALIZED. A draft run holds working figures
-- that Finance is still adjusting, and somebody reading a provisional net pay
-- as though it were their salary is a worse outcome than waiting a day.

DROP POLICY IF EXISTS "prun_read" ON payroll_runs;
CREATE POLICY "prun_read" ON payroll_runs FOR SELECT TO authenticated
  USING (
    can_manage_payroll()
    OR can_oversee_payroll()
    OR (
      status = 'FINALIZED'
      AND EXISTS (
        SELECT 1 FROM payroll_lines l
         WHERE l.run_id = payroll_runs.id
           AND l.employee_id = my_payroll_employee_id()
      )
    )
  );

DROP POLICY IF EXISTS "pline_read" ON payroll_lines;
CREATE POLICY "pline_read" ON payroll_lines FOR SELECT TO authenticated
  USING (
    can_manage_payroll()
    OR (
      employee_id = my_payroll_employee_id()
      AND EXISTS (
        SELECT 1 FROM payroll_runs r
         WHERE r.id = payroll_lines.run_id AND r.status = 'FINALIZED'
      )
    )
  );

-- Who this actually reaches today, so the gap is visible rather than assumed.
SELECT count(*) FILTER (WHERE p.user_email IS NOT NULL AND p.user_email <> '') AS can_self_serve,
       count(*) AS on_payroll
  FROM payroll_employees pe
  LEFT JOIN people p ON p.id = pe.person_id
 WHERE pe.status = 'ACTIVE';
