-- 284: one PTPTN direction set to what PTPTN's letter says.
--
-- EMP-135 carries a direction keyed before the letter was to hand, and three
-- fields differ from it. PTPTN's letter of 11 June 2026 states:
--
-- (Its reference carries the borrower's IC and loan number. Those are not
-- repeated here: a migration is a public-facing file in a repository, and the
-- employee record and the audit row below already identify who this is to
-- anybody entitled to look.)
--
--   ANSURAN     RM 182.30
--   BULAN MULA  Jun 2026
--   BULAN TAMAT November 2037
--
-- against a record of RM 182.35 from 1 May 2026 with no end.
--
-- Each of the three is live, not cosmetic:
--
--   * 5 sen a month is 5 sen remitted against somebody's loan that PTPTN is
--     not expecting, every month for eleven years.
--   * A start of 1 May deducts a month PTPTN has not asked for. The letter
--     says the instalment begins in June.
--   * No end date means the deduction runs until LCM's own record of the debt
--     reaches nothing, which at this rate is about April 2035 — two and a half
--     years before PTPTN's own schedule ends. That gap is interest, which is
--     not LCM's to compute, so the end can only come from the letter. Recorded
--     here, the deduction stops when PTPTN says it stops.
--
-- The balance itself already matches at RM 19,685.51 and is not touched.
-- balance_as_at stays at 1 May 2026: it is the day the figure was advised, and
-- nothing turns on it here, because no deduction exists before the new start
-- month for it to exclude.
--
-- Safe to apply, and checked rather than assumed: not one deduction has been
-- recorded against this direction. Changing the amount or the first month when
-- money had already been withheld would restate what was remitted, so this
-- refuses in that case and says so.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM ptptn_deductions d
    JOIN employee_ptptn p ON p.id = d.ptptn_id
    JOIN payroll_employees e ON e.id = p.employee_id
   WHERE e.emp_no = 'EMP-135';
  IF n > 0 THEN
    RAISE EXCEPTION
      'This direction already has % deduction(s) recorded. Changing the instalment or the first month would restate what was withheld and remitted — settle those first.', n;
  END IF;
END $$;

UPDATE employee_ptptn p
   SET monthly_amount = 182.30,
       started_on     = DATE '2026-06-01',
       -- Inclusive of November 2037: ptptnDue stops a direction only in the
       -- month AFTER ended_on, so the last instalment falls in November.
       ended_on       = DATE '2037-11-30'
  FROM payroll_employees e
 WHERE e.id = p.employee_id
   AND e.emp_no = 'EMP-135'
   AND p.status = 'ACTIVE';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM employee_ptptn p
    JOIN payroll_employees e ON e.id = p.employee_id
   WHERE e.emp_no = 'EMP-135'
     AND p.monthly_amount = 182.30
     AND p.started_on = DATE '2026-06-01'
     AND p.ended_on   = DATE '2037-11-30';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one direction to match the letter, found %.', n;
  END IF;
END $$;

INSERT INTO payroll_audit_log (action, entity, employee_id, detail, actor)
SELECT 'PTPTN_UPDATED', COALESCE(p.reference_no, 'PTPTN'), p.employee_id,
       'Set to PTPTN''s letter of 11 June 2026: instalment 182.35 → 182.30, '
       || 'first month May 2026 → June 2026, and an end of November 2037 recorded where '
       || 'there had been none. The advised balance of 19,685.51 is unchanged. No deduction '
       || 'had been made, so nothing remitted is restated. Migration 284.',
       'claude-code (approved by the user)'
  FROM employee_ptptn p
  JOIN payroll_employees e ON e.id = p.employee_id
 WHERE e.emp_no = 'EMP-135' AND p.monthly_amount = 182.30;

COMMIT;
