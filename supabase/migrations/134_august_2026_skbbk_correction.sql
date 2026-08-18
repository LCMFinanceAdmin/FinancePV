-- 134: put SKBBK into the finalised August 2026 run.
--
-- A data correction rather than a schema change, kept here so it is reviewable
-- and so the reasoning survives with it.
--
-- August 2026 was finalised before 133 set the SKBBK rate, so its lines carry
-- skbbk = 0.00. The salaries that were actually paid had SKBBK deducted, and
-- PERKESO has not been remitted for that wage month yet. Since the PERKESO
-- summary is generated from these lines, leaving them alone would remit less
-- than was withheld from the employees — the church holding money it has
-- already collected on PERKESO's behalf.
--
-- Corrected in place rather than by reverting and re-finalising the run, which
-- would recompute it correctly but also cancels the payment vouchers already
-- generated against it.
--
-- No payroll_adjustments row is created for this. The rate now covers August,
-- so the yearly sheet already computes 31.80 / 20.33 for that month; an
-- adjustment on top would show it twice. Adjustments are for what the rate
-- table cannot express, and this is not that — it is a stale snapshot.
--
-- Guarded on skbbk = 0, so running it a second time changes nothing.

BEGIN;

CREATE TEMP TABLE aug_fix ON COMMIT DROP AS
SELECT l.id,
       l.employee_name,
       round(least(l.gross, sr.skbbk_ceiling) * sr.skbbk_ee, 2) AS new_skbbk
FROM payroll_lines l
JOIN payroll_runs r  ON r.id = l.run_id
JOIN payroll_statutory_rates sr ON sr.year = r.year
WHERE r.year = 2026
  AND r.month = 8
  AND l.skbbk = 0
  AND r.month >= sr.skbbk_from_month;

UPDATE payroll_lines l
   SET skbbk = a.new_skbbk,
       net   = l.net - a.new_skbbk
  FROM aug_fix a
 WHERE a.id = l.id;

-- The run's own total follows its lines. total_lcm is deliberately untouched:
-- SKBBK is employee-side, so what the church pays out in total is unchanged —
-- the split between the employee and PERKESO is what moved.
UPDATE payroll_runs r
   SET total_net = (SELECT sum(net) FROM payroll_lines WHERE run_id = r.id)
 WHERE r.year = 2026 AND r.month = 8
   AND EXISTS (SELECT 1 FROM aug_fix);

-- PERKESO is owed the SKBBK; the salary payment is smaller by the same amount.
UPDATE payroll_vouchers v
   SET total_amount = v.total_amount + (SELECT sum(new_skbbk) FROM aug_fix)
 WHERE v.kind = 'PERKESO'
   AND v.run_id = (SELECT id FROM payroll_runs WHERE year = 2026 AND month = 8)
   AND EXISTS (SELECT 1 FROM aug_fix);

UPDATE payroll_vouchers v
   SET total_amount = v.total_amount - (SELECT sum(new_skbbk) FROM aug_fix)
 WHERE v.kind = 'SALARY'
   AND v.run_id = (SELECT id FROM payroll_runs WHERE year = 2026 AND month = 8)
   AND EXISTS (SELECT 1 FROM aug_fix);

-- A finalised run being edited outside the app is exactly what an audit log is
-- for, and this one cannot be reconstructed from the row afterwards.
INSERT INTO payroll_audit_log (action, entity, detail, actor)
SELECT 'LINE_CORRECTED',
       'August 2026',
       'SKBBK added to finalised lines (the rate was unset when the run was made): '
         || string_agg(employee_name || ' ' || new_skbbk::text, ', ' ORDER BY employee_name)
         || '. Net and the PERKESO / SALARY vouchers moved to match. PERKESO not yet remitted for this month.',
       'migration 134'
FROM aug_fix
HAVING count(*) > 0;

COMMIT;
