-- 282: a custom item can earn a thirteenth payment, and says so.
--
-- 280 gave these items one flag: is this part of the gross? That decides
-- EPF, SOCSO, EIS and PCB, and it is not the same question as whether the
-- item is paid a thirteenth time at the end of the year.
--
-- The proof that they are different questions is already in the salary
-- record. The STM allowance is part of the gross — every statutory figure is
-- worked out on it — and it is deliberately excluded from the 13th month,
-- because it is a secondment allowance: it pays for the secondment while the
-- secondment lasts, and does not earn a thirteenth of itself. A cost-of-
-- living allowance is the same shape of thing for the months it is lived
-- through.
--
-- A salary difference is not. "Salary Difference from 2024 and 2025" is
-- wages the church owed for two earlier years and paid late, across 2026. A
-- thirteenth of the wage it corrects was owed too, so it earns one.
--
-- Hence a second flag rather than a reading of the first. Default false: no
-- item joins a bonus unless somebody said it does, because the failure that
-- matters here is money appearing in a payment nobody decided on.
--
-- The constraint keeps the two honest. Nothing can earn a thirteenth of the
-- wage without being part of the wage.

BEGIN;

ALTER TABLE payroll_employee_custom_items
  ADD COLUMN IF NOT EXISTS in_thirteenth BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN payroll_employee_custom_items.in_thirteenth IS
  'True where this item earns a thirteenth payment at the end of the year, '
  'alongside the salary the 13th month is paid on. A separate question from '
  'in_gross and not implied by it: a secondment or cost-of-living allowance '
  'is part of the gross and pays for an arrangement while it lasts, so it is '
  'not paid a thirteenth time. Wages owed for an earlier period are. '
  'The bonus is paid on December''s salary, so December''s items are the ones '
  'read — an item that ends in December leaves the bonus by itself the '
  'following year.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'payroll_custom_item_thirteenth_needs_gross'
  ) THEN
    ALTER TABLE payroll_employee_custom_items
      ADD CONSTRAINT payroll_custom_item_thirteenth_needs_gross
      CHECK (NOT in_thirteenth OR in_gross);
  END IF;
END $$;

-- ── The one item asked for ───────────────────────────────────────────────
--
-- Safe to apply, and checked rather than assumed: no 13th month has been run
-- for anybody, in any year. Nothing already paid is restated. If a 13th-month
-- line has appeared for this employee since, this refuses and says so — a
-- finalised run keeps its own figures, and the sheet would then disagree with
-- what was filed.

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM payroll_lines l
    JOIN payroll_runs r ON r.id = l.run_id
    JOIN payroll_employees e ON e.id = l.employee_id
   WHERE e.emp_no = 'EMP-188' AND r.month = 13;
  IF n > 0 THEN
    RAISE EXCEPTION
      'This employee already has % 13th-month line(s). Adding the item to the bonus base would make the sheet disagree with what was filed — decide what to do about those first.', n;
  END IF;
END $$;

UPDATE payroll_employee_custom_items c
   SET in_thirteenth = true
  FROM payroll_employees e
 WHERE e.id = c.employee_id
   AND e.emp_no = 'EMP-188'
   AND c.label ILIKE 'Salary Difference%'
   AND c.in_gross
   AND NOT c.in_thirteenth;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM payroll_employee_custom_items c
    JOIN payroll_employees e ON e.id = c.employee_id
   WHERE e.emp_no = 'EMP-188' AND c.label ILIKE 'Salary Difference%' AND c.in_thirteenth;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one item to earn a thirteenth, found %.', n;
  END IF;
END $$;

-- Nothing else is touched. The cost-of-living allowance on the same record
-- stays out of the bonus: it was not asked about, and it pays for the months
-- it is lived through rather than earning a thirteenth of itself.

INSERT INTO payroll_audit_log (action, entity, employee_id, detail, actor)
SELECT 'PAY_ITEM_UPDATED', c.label, c.employee_id,
       'Now earns a thirteenth payment. It is wages owed for 2024 and 2025, paid '
       || 'across 2026, so a thirteenth of the salary it corrects was owed as well. '
       || 'It runs to December 2026 and so leaves the bonus by itself next year. '
       || 'Migration 282.',
       'claude-code (approved by the user)'
  FROM payroll_employee_custom_items c
  JOIN payroll_employees e ON e.id = c.employee_id
 WHERE e.emp_no = 'EMP-188' AND c.label ILIKE 'Salary Difference%' AND c.in_thirteenth;

COMMIT;
