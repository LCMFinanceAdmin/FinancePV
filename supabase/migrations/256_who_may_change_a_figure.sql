-- Who may change a payroll figure
--
-- Six people between them: the Finance Executive, the Accounts Executive, the
-- General Manager, the Treasurer, the Secretary and the Bishop. The first two
-- keep the payroll; the General Manager runs it; the last three answer for the
-- church's money. can_edit_payroll_figures() had only the finance roles, so
-- the other four could not correct a figure they are accountable for.
--
-- Those six are already named by two functions — can_manage_payroll() and
-- can_oversee_payroll() — so this says so rather than listing roles a third
-- time. A list repeated three times is a list that will disagree with itself.
--
-- Changing a figure means seeing it, and oversight could not. The Bishop, the
-- Treasurer and the Secretary could read a run and its vouchers but not the
-- salaries, adjustments or allowances behind them, so the sheet they are now
-- expected to correct would have been empty. Their read is widened to the
-- payroll detail, which is a real widening of who sees what people are paid
-- and is the price of asking them to answer for it.
--
-- And three tables were open to everybody.
--
-- payroll_employee_custom_items, payroll_run_custom_amounts and
-- payroll_run_custom_defs each carried a FOR ALL policy of `NOT is_guest()`.
-- Permissive policies are OR-ed, so on the first of those it sat beside a
-- policy requiring a finance role and cancelled it: anybody signed in could
-- add a monthly allowance to anybody's pay, or take one away, and the figure
-- would simply appear in the next run. Two of the three had no narrower
-- policy at all.
--
-- That is the same question this migration is about — who may change a
-- figure — so it is answered here rather than left for later.

BEGIN;

-- ---------------------------------------------------------------------------
-- The six
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_edit_payroll_figures()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Finance, Accounts and the General Manager keep and run the payroll;
  -- the Bishop, Treasurer and Secretary answer for it.
  SELECT can_manage_payroll() OR can_oversee_payroll();
$$;

COMMENT ON FUNCTION can_edit_payroll_figures() IS
  'The six who may change a payroll figure: Finance Executive, Accounts '
  'Executive, General Manager, Treasurer, Secretary, Bishop.';

REVOKE EXECUTE ON FUNCTION can_edit_payroll_figures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_edit_payroll_figures() TO authenticated;

-- ---------------------------------------------------------------------------
-- Seeing what they are being asked to correct
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pe_read ON payroll_employees;
CREATE POLICY pe_read ON payroll_employees FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR id = my_payroll_employee_id()
);

DROP POLICY IF EXISTS ps_read ON payroll_salary;
CREATE POLICY ps_read ON payroll_salary FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);

DROP POLICY IF EXISTS payroll_adj_read ON payroll_adjustments;
CREATE POLICY payroll_adj_read ON payroll_adjustments FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);

DROP POLICY IF EXISTS pline_read ON payroll_lines;
CREATE POLICY pline_read ON payroll_lines FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);

-- The rate tables and the employer list are the setting a figure is read
-- against; without them the sheet cannot be computed at all.
DROP POLICY IF EXISTS psr_read ON payroll_statutory_rates;
CREATE POLICY psr_read ON payroll_statutory_rates FOR SELECT USING (NOT is_guest());

DROP POLICY IF EXISTS contrib_bands_read ON payroll_contribution_bands;
CREATE POLICY contrib_bands_read ON payroll_contribution_bands FOR SELECT USING (NOT is_guest());

DROP POLICY IF EXISTS pemployer_read ON payroll_employers;
CREATE POLICY pemployer_read ON payroll_employers FOR SELECT USING (NOT is_guest());

-- ---------------------------------------------------------------------------
-- Closing the three that were open to everybody
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS custom_items_all     ON payroll_employee_custom_items;
DROP POLICY IF EXISTS emp_custom_items_all ON payroll_employee_custom_items;
DROP POLICY IF EXISTS peci_read            ON payroll_employee_custom_items;
DROP POLICY IF EXISTS peci_write           ON payroll_employee_custom_items;

CREATE POLICY peci_read ON payroll_employee_custom_items FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);
CREATE POLICY peci_write ON payroll_employee_custom_items FOR ALL
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

DROP POLICY IF EXISTS custom_amounts_all ON payroll_run_custom_amounts;
DROP POLICY IF EXISTS prca_read          ON payroll_run_custom_amounts;
DROP POLICY IF EXISTS prca_write         ON payroll_run_custom_amounts;

CREATE POLICY prca_read ON payroll_run_custom_amounts FOR SELECT USING (
  can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id()
);
CREATE POLICY prca_write ON payroll_run_custom_amounts FOR ALL
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

DROP POLICY IF EXISTS custom_defs_all ON payroll_run_custom_defs;
DROP POLICY IF EXISTS prcd_read       ON payroll_run_custom_defs;
DROP POLICY IF EXISTS prcd_write      ON payroll_run_custom_defs;

-- A column heading on a run names no figure on its own, so anybody who may
-- read the run may read these; only the six may add or rename one.
CREATE POLICY prcd_read ON payroll_run_custom_defs FOR SELECT USING (NOT is_guest());
CREATE POLICY prcd_write ON payroll_run_custom_defs FOR ALL
  USING (can_edit_payroll_figures()) WITH CHECK (can_edit_payroll_figures());

COMMIT;
