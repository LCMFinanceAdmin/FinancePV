-- 110: Finalising a payroll run becomes one transaction.
--
-- Finalising deleted the previous lines, vouchers and loan repayments, then
-- re-inserted them — four separate round trips from the browser with no
-- transaction around them. The delete is there for a good reason (re-finalising
-- used to append a second set of everything and double the sheet), but it means
-- there is a window in which the month's payroll exists nowhere. A closed tab,
-- a dropped connection or one failed insert leaves the run with its old figures
-- gone and the new ones never written, with no warning and nothing to roll back
-- to.
--
-- The figures are still computed in the browser — that is where the rates,
-- the increment timing and the manual PCB live, and moving the engine into SQL
-- is a different job. What moves here is the writing: everything lands or
-- nothing does.

CREATE OR REPLACE FUNCTION finalize_payroll_run(
  p_run_id     UUID,
  p_lines      JSONB,   -- [{employee_id, employee_name, gross, pcb, epf_ee, …}]
  p_vouchers   JSONB,   -- [{kind, payee, total_amount}]
  p_repayments JSONB,   -- [{loan_id, year, month, amount, balance_after}]
  p_totals     JSONB    -- {total_gross, total_net, total_employer, total_lcm}
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

  -- Lock the run for the duration, so two people finalising the same month at
  -- once queue up rather than interleaving their deletes and inserts.
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;
  IF v_run.status = 'PAID' THEN
    RAISE EXCEPTION 'This run has been paid and cannot be finalised again';
  END IF;

  -- Clear the previous attempt. Safe here in a way it was not before: if
  -- anything below fails, this delete is undone with it.
  DELETE FROM payroll_vouchers WHERE run_id = p_run_id;
  DELETE FROM payroll_lines    WHERE run_id = p_run_id;
  DELETE FROM loan_repayments  WHERE payroll_run_id = p_run_id;

  INSERT INTO payroll_lines (
    run_id, employee_id, employee_name, gross, pcb,
    epf_ee, epf_er, socso_ee, socso_er, eis_ee, eis_er,
    epl, net, total_lcm, custom_items
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

  -- A loan that reached zero this month is settled. Done from the rows just
  -- written rather than from a separate list, so the two cannot disagree.
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

GRANT EXECUTE ON FUNCTION finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB) IS
  'Writes a payroll run''s lines, vouchers and loan repayments as one transaction. Everything lands or nothing does.';
