-- 227: join an allowance to the person it is paid to.
--
-- LCM pays allowances outside payroll, deliberately: they are not salary, are
-- not taxed as salary, and must not inflate the EPF or SOCSO base. They go out
-- each month on the recurring expenses PV, in the group
-- "ECP Public Bank - Monthly Recurring / Allowances" — 22 items, about
-- RM 15,790 a month.
--
-- That arrangement is right and is not changed here. What is missing is that a
-- recurring PV names its payee in free text, so nothing connects the allowance
-- to the employee record. Finance cannot see from the payroll side what
-- somebody receives on top of their salary, the two spellings of a name drift
-- apart, and a person who leaves keeps their allowance until somebody
-- remembers.
--
-- One row, two doors. The allowance stays a recurring PV — the monthly bundle
-- is built from those and must keep working untouched — and the payroll side
-- reads and edits the same row through this link. Nothing is copied, so there
-- is nothing to fall out of step.

ALTER TABLE recurring_pvs
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES payroll_employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_pvs_employee ON recurring_pvs(employee_id);

COMMENT ON COLUMN recurring_pvs.employee_id IS
  'The employee this recurring payment belongs to, where it is one — an '
  'allowance paid outside payroll. NULL for everything else: rent, utilities, '
  'subscriptions. Set deliberately rather than derived from payee_name, which '
  'is free text and does not always match the payroll spelling.';

-- ── Link only what is unambiguous ──────────────────────────────────────────
-- An exact name match, and exactly one candidate. Nine of the twenty-two do
-- not qualify: eight are on payroll under a different spelling and one,
-- HO CHEE WAY, matches three different people. Those are left for somebody who
-- knows which person is meant — a wrong link here would quietly attribute an
-- allowance to the wrong member of staff, and read as fact afterwards.
UPDATE recurring_pvs r
   SET employee_id = e.id
  FROM payroll_employees e
 WHERE r.employee_id IS NULL
   AND r.active
   AND r.group_name LIKE '%Allowances%'
   AND lower(trim(e.full_name)) = lower(trim(r.payee_name))
   AND (SELECT count(*) FROM payroll_employees x
         WHERE lower(trim(x.full_name)) = lower(trim(r.payee_name))) = 1;
