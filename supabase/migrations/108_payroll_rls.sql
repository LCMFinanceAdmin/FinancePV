-- 108: Close payroll.
--
-- Every policy on every payroll table was USING (true) — for SELECT, INSERT,
-- UPDATE and DELETE. Access was enforced only by which pages the sidebar
-- offered, which is not access control: any account that can sign in could
-- read every salary, IC number, date of birth and loan balance in the church,
-- and could change or delete them. A volunteer EXCO member, a vendor contact,
-- a building manager — all of them.
--
-- The people directory was given can_manage_people() in migration 099 for
-- exactly this reason. Payroll holds strictly more sensitive data and never
-- got the same treatment. This is that treatment.
--
-- Two capabilities, deliberately separate:
--   can_manage_payroll()      — Finance, Accounts, the GM. Runs payroll.
--   my_payroll_employee_id()  — anyone, about themselves only.
--
-- Two capabilities is not quite enough, because the signatories sit in between:
-- the Bishop and Treasurer sign loan applications and the audit log is already
-- open to all three of them. So there is a third, narrower one:
--   can_oversee_payroll()     — the signatories. Loans, runs and the audit log
--                               as totals and decisions; never an individual
--                               salary, payslip or employee record.
--
-- That line is deliberate. Approving a payroll voucher means agreeing a total;
-- it has never meant reading what each person is paid.

-- ── Who runs payroll ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION can_manage_payroll()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
  );
$$;

GRANT EXECUTE ON FUNCTION can_manage_payroll() TO authenticated;

-- ── Who oversees it without running it ────────────────────────────────────
-- The signatories. They sign loan applications and read the audit log; both
-- are already offered to them by the app, and closing them would be a
-- regression dressed up as a fix.
CREATE OR REPLACE FUNCTION can_oversee_payroll()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('BISHOP','TREASURER','SECRETARY')
  );
$$;

GRANT EXECUTE ON FUNCTION can_oversee_payroll() TO authenticated;

-- ── Which payroll record is mine ──────────────────────────────────────────
-- The link runs login → people.user_email → people.id → payroll_employees.
-- person_id was added in migration 102 and back-filled by name; anyone not
-- linked yet simply has no self-access until they are, which fails closed.
CREATE OR REPLACE FUNCTION my_payroll_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pe.id
    FROM payroll_employees pe
    JOIN people p ON p.id = pe.person_id
   WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION my_payroll_employee_id() TO authenticated;

-- ── payroll_employees ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pe_select" ON payroll_employees;
DROP POLICY IF EXISTS "pe_insert" ON payroll_employees;
DROP POLICY IF EXISTS "pe_update" ON payroll_employees;
DROP POLICY IF EXISTS "pe_delete" ON payroll_employees;

CREATE POLICY "pe_read" ON payroll_employees FOR SELECT TO authenticated
  USING (can_manage_payroll() OR id = my_payroll_employee_id());
CREATE POLICY "pe_write" ON payroll_employees FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── payroll_salary ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ps_select" ON payroll_salary;
DROP POLICY IF EXISTS "ps_insert" ON payroll_salary;
DROP POLICY IF EXISTS "ps_update" ON payroll_salary;
DROP POLICY IF EXISTS "ps_delete" ON payroll_salary;

CREATE POLICY "ps_read" ON payroll_salary FOR SELECT TO authenticated
  USING (can_manage_payroll() OR employee_id = my_payroll_employee_id());
CREATE POLICY "ps_write" ON payroll_salary FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── payroll_runs ──────────────────────────────────────────────────────────
-- A run is the whole month for the whole church. There is no "my" version of
-- it, so this one is managers only.
DROP POLICY IF EXISTS "prun_all"    ON payroll_runs;
DROP POLICY IF EXISTS "prun_select" ON payroll_runs;
DROP POLICY IF EXISTS "prun_insert" ON payroll_runs;
DROP POLICY IF EXISTS "prun_update" ON payroll_runs;
DROP POLICY IF EXISTS "prun_delete" ON payroll_runs;

CREATE POLICY "prun_read" ON payroll_runs FOR SELECT TO authenticated
  USING (can_manage_payroll() OR can_oversee_payroll());
CREATE POLICY "prun_write" ON payroll_runs FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── payroll_lines ─────────────────────────────────────────────────────────
-- A line is a payslip. Mine is mine.
DROP POLICY IF EXISTS "pline_select" ON payroll_lines;
DROP POLICY IF EXISTS "pline_insert" ON payroll_lines;
DROP POLICY IF EXISTS "pline_update" ON payroll_lines;
DROP POLICY IF EXISTS "pline_delete" ON payroll_lines;

CREATE POLICY "pline_read" ON payroll_lines FOR SELECT TO authenticated
  USING (can_manage_payroll() OR employee_id = my_payroll_employee_id());
CREATE POLICY "pline_write" ON payroll_lines FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── payroll_vouchers ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pvou_all"    ON payroll_vouchers;
DROP POLICY IF EXISTS "pvou_select" ON payroll_vouchers;
DROP POLICY IF EXISTS "pvou_insert" ON payroll_vouchers;
DROP POLICY IF EXISTS "pvou_update" ON payroll_vouchers;
DROP POLICY IF EXISTS "pvou_delete" ON payroll_vouchers;

CREATE POLICY "pvou_read" ON payroll_vouchers FOR SELECT TO authenticated
  USING (can_manage_payroll() OR can_oversee_payroll());
CREATE POLICY "pvou_write" ON payroll_vouchers FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── employee_loans ────────────────────────────────────────────────────────
-- A borrower must be able to see what they owe — that is the whole of the
-- My Loan page — but never to change the terms.
DROP POLICY IF EXISTS "el_select" ON employee_loans;
DROP POLICY IF EXISTS "el_insert" ON employee_loans;
DROP POLICY IF EXISTS "el_update" ON employee_loans;
DROP POLICY IF EXISTS "el_delete" ON employee_loans;

CREATE POLICY "el_read" ON employee_loans FOR SELECT TO authenticated
  USING (can_manage_payroll() OR can_oversee_payroll() OR employee_id = my_payroll_employee_id());
CREATE POLICY "el_write" ON employee_loans FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── loan_repayments ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lr_select" ON loan_repayments;
DROP POLICY IF EXISTS "lr_insert" ON loan_repayments;
DROP POLICY IF EXISTS "lr_update" ON loan_repayments;
DROP POLICY IF EXISTS "lr_delete" ON loan_repayments;

CREATE POLICY "lr_read" ON loan_repayments FOR SELECT TO authenticated
  USING (
    can_manage_payroll()
    OR EXISTS (
      SELECT 1 FROM employee_loans el
       WHERE el.id = loan_repayments.loan_id
         AND el.employee_id = my_payroll_employee_id()
    )
  );
CREATE POLICY "lr_write" ON loan_repayments FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

-- ── payroll_employee_custom_items ─────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.payroll_employee_custom_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE payroll_employee_custom_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "peci_select" ON payroll_employee_custom_items';
    EXECUTE 'DROP POLICY IF EXISTS "peci_insert" ON payroll_employee_custom_items';
    EXECUTE 'DROP POLICY IF EXISTS "peci_update" ON payroll_employee_custom_items';
    EXECUTE 'DROP POLICY IF EXISTS "peci_delete" ON payroll_employee_custom_items';
    EXECUTE 'DROP POLICY IF EXISTS "peci_read"   ON payroll_employee_custom_items';
    EXECUTE 'DROP POLICY IF EXISTS "peci_write"  ON payroll_employee_custom_items';
    EXECUTE 'CREATE POLICY "peci_read" ON payroll_employee_custom_items FOR SELECT TO authenticated
             USING (can_manage_payroll() OR employee_id = my_payroll_employee_id())';
    EXECUTE 'CREATE POLICY "peci_write" ON payroll_employee_custom_items FOR ALL TO authenticated
             USING (can_manage_payroll()) WITH CHECK (can_manage_payroll())';
  END IF;
END $$;

-- ── payroll_audit_log ─────────────────────────────────────────────────────
-- The log of who changed what. Managers read it; nobody edits it.
DO $$
BEGIN
  IF to_regclass('public.payroll_audit_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE payroll_audit_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "pal_select" ON payroll_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "pal_insert" ON payroll_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "pal_update" ON payroll_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "pal_delete" ON payroll_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "pal_read"   ON payroll_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "pal_write"  ON payroll_audit_log';
    EXECUTE 'CREATE POLICY "pal_read" ON payroll_audit_log FOR SELECT TO authenticated
             USING (can_manage_payroll() OR can_oversee_payroll())';
    -- Append-only: the log is written as actions happen and never amended.
    EXECUTE 'CREATE POLICY "pal_append" ON payroll_audit_log FOR INSERT TO authenticated
             WITH CHECK (can_manage_payroll())';
  END IF;
END $$;

-- ── payroll_statutory_rates ───────────────────────────────────────────────
-- EPF and PERKESO rates are published by the government; there is nothing to
-- hide. Reading stays open so a payslip can be explained; only payroll may
-- change them.
DO $$
BEGIN
  IF to_regclass('public.payroll_statutory_rates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE payroll_statutory_rates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "psr_select" ON payroll_statutory_rates';
    EXECUTE 'DROP POLICY IF EXISTS "psr_insert" ON payroll_statutory_rates';
    EXECUTE 'DROP POLICY IF EXISTS "psr_update" ON payroll_statutory_rates';
    EXECUTE 'DROP POLICY IF EXISTS "psr_delete" ON payroll_statutory_rates';
    EXECUTE 'DROP POLICY IF EXISTS "psr_read"   ON payroll_statutory_rates';
    EXECUTE 'DROP POLICY IF EXISTS "psr_write"  ON payroll_statutory_rates';
    EXECUTE 'CREATE POLICY "psr_read" ON payroll_statutory_rates FOR SELECT TO authenticated
             USING (true)';
    EXECUTE 'CREATE POLICY "psr_write" ON payroll_statutory_rates FOR ALL TO authenticated
             USING (can_manage_payroll()) WITH CHECK (can_manage_payroll())';
  END IF;
END $$;

-- ── N4: issuing a payment reference is not for everyone ───────────────────
-- next_payment_ref() was granted to every authenticated user with no check
-- inside it, so anyone signed in could advance a series. Editing a series was
-- guarded; issuing from it was not.
CREATE OR REPLACE FUNCTION next_payment_ref(
  p_account_id UUID,
  p_pv_id      UUID DEFAULT NULL,
  p_pv_no      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        payment_ref_series%ROWTYPE;
  v_year   INT := EXTRACT(YEAR FROM CURRENT_DATE);
  v_number INT;
  v_ref    TEXT;
BEGIN
  IF NOT can_manage_payment_refs() THEN
    RAISE EXCEPTION 'Only Finance may issue a payment reference';
  END IF;

  SELECT * INTO s FROM payment_ref_series
   WHERE bank_account_id = p_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No reference series is set up for that account. Add one in Settings → Payment References.';
  END IF;
  IF NOT s.active THEN
    RAISE EXCEPTION 'The reference series for that account is switched off.';
  END IF;

  IF s.reset_yearly AND v_year <> s.current_year THEN
    v_number := 1;
  ELSE
    v_number := s.next_number;
  END IF;

  v_ref := format_payment_ref(s.prefix, s.digits, s.year_format, s.separator, v_number, v_year);

  UPDATE payment_ref_series
     SET next_number  = v_number + 1,
         current_year = v_year,
         updated_at   = NOW()
   WHERE id = s.id;

  INSERT INTO payment_ref_issues (series_id, reference, seq_number, year, pv_id, pv_no, issued_by)
  VALUES (s.id, v_ref, v_number, v_year, p_pv_id, p_pv_no, auth.jwt() ->> 'email');

  RETURN v_ref;
END;
$$;

GRANT EXECUTE ON FUNCTION next_payment_ref(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION can_manage_payroll() IS
  'Finance, Accounts and the GM. Runs payroll.';
COMMENT ON FUNCTION can_oversee_payroll() IS
  'Signatories. Loans, runs and the audit log; never an individual salary or payslip.';
COMMENT ON FUNCTION my_payroll_employee_id() IS
  'The caller''s own payroll record, via people.user_email. NULL when unlinked, which fails closed.';
