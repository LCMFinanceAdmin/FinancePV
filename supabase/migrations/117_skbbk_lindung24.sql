-- 117: SKBBK (Lindung 24) — a separate deduction on the employee's side.
--
-- PERKESO's schedule carries SKBBK alongside SOCSO. It tops up the employee's
-- contribution, and unlike SOCSO it is not universal: an employee may opt out,
-- and those who have opted out must not be charged it.
--
-- Three things follow, and they are why this is not just a bigger socso_ee
-- rate:
--
--   1. It varies per employee, so it cannot live in the rate table alone.
--   2. It is the employee's alone — there is no employer share.
--   3. It has to read as its own line. Rolling it into SOCSO would understate
--      SOCSO on every payslip and in every year-end figure, and an employee
--      asking why their deduction changed would have nothing to point at.
--
-- The rate ships as ZERO deliberately. I do not have the PERKESO figure to
-- hand, and a plausible-looking guess is worse here than an obvious blank:
-- zero deducts nothing and is visibly unset, whereas a wrong rate quietly
-- takes the wrong amount from every salary. Finance enters it under
-- Payroll → Statutory Rates, per year, alongside the SOCSO and EIS rates.

-- ── The rate, per year, like every other statutory figure ─────────────────
ALTER TABLE payroll_statutory_rates
  ADD COLUMN IF NOT EXISTS skbbk_ee      DECIMAL(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skbbk_ceiling DECIMAL(12,2) NOT NULL DEFAULT 6000;

COMMENT ON COLUMN payroll_statutory_rates.skbbk_ee IS
  'SKBBK (Lindung 24) employee rate as a fraction. Zero until Finance sets it — a blank deducts nothing, a guess deducts the wrong amount.';

-- ── Who is in the scheme ──────────────────────────────────────────────────
-- Opt-OUT, not opt-in: the default is that an employee is covered, which is
-- how the scheme works. Recording it this way round also means a new employee
-- is enrolled unless somebody says otherwise, rather than being silently
-- uncovered because a box went unticked.
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS skbbk_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN payroll_employees.skbbk_opted_out IS
  'TRUE if this employee has opted out of SKBBK (Lindung 24). Default FALSE — everyone is in the scheme unless they have left it.';

-- ── What was actually deducted ────────────────────────────────────────────
-- Stored per line, not recomputed from the rate later: the rate can change,
-- an employee can opt out mid-year, and a payslip issued in March must still
-- show March's figure in December.
ALTER TABLE payroll_lines
  ADD COLUMN IF NOT EXISTS skbbk DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ── Carry it through the finalise ─────────────────────────────────────────
-- Same function as 110, with skbbk added to the line insert. Everything else
-- is unchanged; it is repeated in full because CREATE OR REPLACE takes the
-- whole body.
CREATE OR REPLACE FUNCTION finalize_payroll_run(
  p_run_id     UUID,
  p_lines      JSONB,
  p_vouchers   JSONB,
  p_repayments JSONB,
  p_totals     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run     payroll_runs%ROWTYPE;
  v_lines   INT := 0;
  v_vouch   INT := 0;
  v_repay   INT := 0;
  v_settled INT := 0;
BEGIN
  IF NOT can_manage_payroll() THEN
    RAISE EXCEPTION 'Only payroll may finalise a run';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;
  IF v_run.status = 'PAID' THEN
    RAISE EXCEPTION 'This run has been paid and cannot be finalised again';
  END IF;

  DELETE FROM payroll_vouchers WHERE run_id = p_run_id;
  DELETE FROM payroll_lines    WHERE run_id = p_run_id;
  DELETE FROM loan_repayments  WHERE payroll_run_id = p_run_id;

  INSERT INTO payroll_lines (
    run_id, employee_id, employee_name, gross, pcb,
    epf_ee, epf_er, socso_ee, socso_er, eis_ee, eis_er,
    skbbk, epl, net, total_lcm, custom_items
  )
  SELECT
    p_run_id,
    (l ->> 'employee_id')::UUID,
    COALESCE(l ->> 'employee_name', ''),
    COALESCE((l ->> 'gross')::NUMERIC, 0),
    COALESCE((l ->> 'pcb')::NUMERIC, 0),
    COALESCE((l ->> 'epf_ee')::NUMERIC, 0),
    COALESCE((l ->> 'epf_er')::NUMERIC, 0),
    COALESCE((l ->> 'socso_ee')::NUMERIC, 0),
    COALESCE((l ->> 'socso_er')::NUMERIC, 0),
    COALESCE((l ->> 'eis_ee')::NUMERIC, 0),
    COALESCE((l ->> 'eis_er')::NUMERIC, 0),
    COALESCE((l ->> 'skbbk')::NUMERIC, 0),
    COALESCE((l ->> 'epl')::NUMERIC, 0),
    COALESCE((l ->> 'net')::NUMERIC, 0),
    COALESCE((l ->> 'total_lcm')::NUMERIC, 0),
    COALESCE(l -> 'custom_items', '[]'::JSONB)
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB)) AS l;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  INSERT INTO payroll_vouchers (run_id, kind, payee, total_amount, status)
  SELECT
    p_run_id,
    v ->> 'kind',
    COALESCE(v ->> 'payee', ''),
    COALESCE((v ->> 'total_amount')::NUMERIC, 0),
    'PENDING'
  FROM jsonb_array_elements(COALESCE(p_vouchers, '[]'::JSONB)) AS v;
  GET DIAGNOSTICS v_vouch = ROW_COUNT;

  INSERT INTO loan_repayments (loan_id, payroll_run_id, year, month, amount, balance_after)
  SELECT
    (r ->> 'loan_id')::UUID,
    p_run_id,
    (r ->> 'year')::INT,
    (r ->> 'month')::INT,
    COALESCE((r ->> 'amount')::NUMERIC, 0),
    COALESCE((r ->> 'balance_after')::NUMERIC, 0)
  FROM jsonb_array_elements(COALESCE(p_repayments, '[]'::JSONB)) AS r;
  GET DIAGNOSTICS v_repay = ROW_COUNT;

  UPDATE employee_loans el
     SET status = 'SETTLED', updated_at = NOW()
   WHERE el.status = 'ACTIVE'
     AND EXISTS (
       SELECT 1 FROM loan_repayments lr
        WHERE lr.loan_id = el.id
          AND lr.payroll_run_id = p_run_id
          AND lr.balance_after <= 0
     );
  GET DIAGNOSTICS v_settled = ROW_COUNT;

  UPDATE payroll_runs
     SET status         = 'FINALIZED',
         finalized_at   = NOW(),
         total_gross    = COALESCE((p_totals ->> 'total_gross')::NUMERIC, 0),
         total_net      = COALESCE((p_totals ->> 'total_net')::NUMERIC, 0),
         total_employer = COALESCE((p_totals ->> 'total_employer')::NUMERIC, 0),
         total_lcm      = COALESCE((p_totals ->> 'total_lcm')::NUMERIC, 0)
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'lines', v_lines, 'vouchers', v_vouch,
    'repayments', v_repay, 'loans_settled', v_settled
  );
END;
$$;

-- CREATE OR REPLACE keeps the existing privileges, so 115's revoke survives.
-- Re-asserted so this migration is correct read on its own.
REVOKE ALL ON FUNCTION finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
