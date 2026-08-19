-- 136: who may change what an employee is paid.
--
-- can_manage_payroll() covers Finance, Accounts and the General Manager, and it
-- is the right gate for running payroll: generating a month, finalising it,
-- recording payment. It is too wide for the figures themselves.
--
-- Adding an allowance, a deduction or a correction changes what lands in
-- somebody's bank account. That is the finance desk's job, and the app has said
-- so for a while — the employee page has gated its edit controls on Finance and
-- Accounts alone since it was written. The database never agreed: the GM could
-- write these rows directly through the API, and only the UI stopped them.
--
-- Hiding a control is not access control. This closes the gap in the direction
-- the app already claimed.

CREATE OR REPLACE FUNCTION can_edit_payroll_figures()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3')
  );
$$;

REVOKE ALL ON FUNCTION can_edit_payroll_figures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_edit_payroll_figures() TO authenticated;

COMMENT ON FUNCTION can_edit_payroll_figures() IS
  'Finance and the Accounts Executive. Narrower than can_manage_payroll(), which also admits the GM: running payroll and changing what somebody is paid are different permissions.';

-- Allowances and deductions.
DROP POLICY IF EXISTS "peci_write" ON payroll_employee_custom_items;
CREATE POLICY "peci_write" ON payroll_employee_custom_items FOR ALL TO authenticated
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

-- Corrections (migration 131).
DROP POLICY IF EXISTS "payroll_adj_write" ON payroll_adjustments;
CREATE POLICY "payroll_adj_write" ON payroll_adjustments FOR ALL TO authenticated
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

-- Reading is unchanged on both: Finance and the GM oversee, and a person can
-- see what was done to their own pay.
