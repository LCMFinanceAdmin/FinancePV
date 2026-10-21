-- An end-to-end scenario, built in the real database and rolled back.
--
-- Three people on the ladder, one of them being promoted; a PTPTN direction
-- part way through its balance; an adjustment running across eight months.
-- The rows are dumped as JSON at the end and fed through the application's own
-- rules, so what is checked is the code that actually runs, against the
-- constraints that actually exist.
--
-- Nothing survives: the whole thing is inside a transaction that rolls back.

BEGIN;

-- The ladder, and what each rung has been worth.
INSERT INTO qualifications(code, label, rank) VALUES
  ('ZZ_MMIN', 'Probe Master of Ministry', 20),
  ('ZZ_DMIN', 'Probe Doctor of Ministry', 30);

INSERT INTO qualification_salary_points(qualification_code, base_salary, effective_from) VALUES
  ('ZZ_MMIN', 4000, '2024-01-01'),
  ('ZZ_MMIN', 4400, '2026-01-01'),
  ('ZZ_DMIN', 5000, '2024-01-01'),
  ('ZZ_DMIN', 5500, '2026-01-01');

-- Three people holding the Master's rung.
--   one on the figure and about to be promoted,
--   one left behind on the old figure,
--   one on a salary agreed deliberately.
INSERT INTO payroll_employees(emp_no, full_name, qualification_code, date_commenced)
VALUES ('ZZ-1', 'Probe Promoted',   'ZZ_MMIN', '2024-01-01'),
       ('ZZ-2', 'Probe Left Behind', 'ZZ_MMIN', '2024-01-01'),
       ('ZZ-3', 'Probe Arrangement', 'ZZ_MMIN', '2024-01-01');

INSERT INTO payroll_salary(employee_id, effective_from, base_salary, increment_carried,
                           increment_current, experience_bonus, family_allowance,
                           stm_allowance, qualification_code, reason, special_arrangement)
SELECT e.id, '2026-01-01'::date, 4400, 150, 50, 0, 0, 0, 'ZZ_MMIN', 'On the 2026 scale', NULL
  FROM payroll_employees e WHERE e.emp_no = 'ZZ-1'
UNION ALL
-- Never moved when the scale went from 4,000 to 4,400.
SELECT e.id, '2024-01-01'::date, 4000, 0, 0, 0, 0, 0, 'ZZ_MMIN', 'On the 2024 scale', NULL
  FROM payroll_employees e WHERE e.emp_no = 'ZZ-2'
UNION ALL
SELECT e.id, '2025-06-01'::date, 5200, 0, 0, 0, 0, 0, 'ZZ_MMIN', 'On appointment',
       'Agreed by EXCO on appointment'
  FROM payroll_employees e WHERE e.emp_no = 'ZZ-3';

-- The promotion: a Doctor of Ministry from July, at the rung's 2026 figure.
INSERT INTO payroll_salary(employee_id, effective_from, base_salary, increment_carried,
                           increment_current, experience_bonus, family_allowance,
                           stm_allowance, qualification_code, reason)
SELECT e.id, '2026-07-01'::date, 5500, 150, 50, 0, 0, 0, 'ZZ_DMIN',
       'Probe Master of Ministry -> Probe Doctor of Ministry'
  FROM payroll_employees e WHERE e.emp_no = 'ZZ-1';
UPDATE payroll_employees SET qualification_code = 'ZZ_DMIN' WHERE emp_no = 'ZZ-1';

-- PTPTN: 1,000 advised in January, 200 a month, four months already taken.
INSERT INTO employee_ptptn(employee_id, monthly_amount, opening_balance, balance_as_at,
                           started_on, reference_no)
SELECT e.id, 200, 1000, '2026-01-01', '2026-01-01', 'ZZ-REF'
  FROM payroll_employees e WHERE e.emp_no = 'ZZ-1';

INSERT INTO ptptn_deductions(ptptn_id, year, month, amount, balance_after)
SELECT p.id, 2026, m.month, 200, 1000 - 200 * m.month
  FROM employee_ptptn p
  JOIN payroll_employees e ON e.id = p.employee_id AND e.emp_no = 'ZZ-1'
  CROSS JOIN (VALUES (1), (2), (3), (4)) AS m(month);

-- An adjustment running May to December: eight rows, one per payslip.
INSERT INTO payroll_adjustments(employee_id, year, month, category, amount, reason)
SELECT e.id, 2026, m.month, 'EPF_EE', 381,
       'Her allowance is mixed with her salary effective May 2026'
  FROM payroll_employees e
  CROSS JOIN generate_series(5, 12) AS m(month)
 WHERE e.emp_no = 'ZZ-1';

-- Everything the rules need, in one object.
SELECT jsonb_build_object(
  'rungs', (SELECT jsonb_agg(to_jsonb(q)) FROM (
      SELECT code, label, rank FROM qualifications WHERE code LIKE 'ZZ\_%') q),
  'points', (SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT qualification_code, base_salary, effective_from
        FROM qualification_salary_points WHERE qualification_code LIKE 'ZZ\_%') p),
  'employees', (SELECT jsonb_agg(to_jsonb(e)) FROM (
      SELECT id, emp_no, full_name, qualification_code
        FROM payroll_employees WHERE emp_no LIKE 'ZZ-%') e),
  'salaries', (SELECT jsonb_agg(to_jsonb(s)) FROM (
      SELECT ps.employee_id, ps.effective_from, ps.created_at, ps.base_salary,
             ps.increment_carried, ps.increment_current, ps.experience_bonus,
             ps.family_allowance, ps.stm_allowance, ps.qualification_code,
             ps.special_arrangement
        FROM payroll_salary ps
        JOIN payroll_employees e ON e.id = ps.employee_id AND e.emp_no LIKE 'ZZ-%') s),
  'ptptn', (SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT p.id, p.employee_id, p.monthly_amount, p.opening_balance, p.balance_as_at,
             p.started_on, p.ended_on, p.status
        FROM employee_ptptn p
        JOIN payroll_employees e ON e.id = p.employee_id AND e.emp_no LIKE 'ZZ-%') d),
  'ptptn_taken', (SELECT jsonb_agg(to_jsonb(t)) FROM (
      SELECT pd.ptptn_id, pd.year, pd.month, pd.amount, pd.payroll_run_id
        FROM ptptn_deductions pd
        JOIN employee_ptptn p ON p.id = pd.ptptn_id
        JOIN payroll_employees e ON e.id = p.employee_id AND e.emp_no LIKE 'ZZ-%') t),
  'adjustments', (SELECT jsonb_agg(to_jsonb(a)) FROM (
      SELECT pa.month, pa.category, pa.amount
        FROM payroll_adjustments pa
        JOIN payroll_employees e ON e.id = pa.employee_id AND e.emp_no LIKE 'ZZ-%'
       ORDER BY pa.month) a)
) AS scenario;

ROLLBACK;
