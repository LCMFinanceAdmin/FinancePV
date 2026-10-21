-- PTPTN in the payroll run
--
-- Migration 253 gave PTPTN a direction to deduct and a record of what was
-- deducted. This puts it in the run, which is where the money actually moves.
--
-- Two things had to go together.
--
-- payroll_lines records every figure on a payslip and had no column for this
-- one. Without it a finalised line would carry a net with PTPTN already taken
-- out and nothing on the line to say where it went, so a payslip regenerated
-- from the stored line would be short by an unexplained amount. That is the
-- kind of discrepancy somebody finds months later and cannot reconstruct.
--
-- And finalize_payroll_run writes the lines, the vouchers and the loan
-- repayments in one transaction. The PTPTN deductions belong in the same one:
-- if they were inserted separately afterwards and that insert failed, the run
-- would stand finalised with the money withheld on the payslip and no record
-- that it was ever taken.
--
-- Note what this deliberately does NOT do. A loan whose balance reaches zero
-- is marked SETTLED here, because the balance is LCM's own figure and reaching
-- zero is a fact. PTPTN's is not: LCM knows only what PTPTN last advised and
-- what it has deducted since, so the record reaching zero is an estimate
-- running out, not a debt being discharged. The direction stays ACTIVE and the
-- payroll pages flag it for somebody to check with PTPTN. Closing it
-- automatically would stop a statutory-style deduction on a guess.

BEGIN;

ALTER TABLE payroll_lines
  ADD COLUMN IF NOT EXISTS ptptn NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN payroll_lines.ptptn IS
  'PTPTN withheld from this payslip and remitted to PTPTN. See migration 253.';

-- The old five-argument version has to go rather than be left beside the new
-- one. A function kept alongside its replacement is a live second path that
-- nobody is thinking about, and PostgREST resolving to the wrong one would
-- quietly stop recording PTPTN while everything still appeared to work.
DROP FUNCTION IF EXISTS finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION finalize_payroll_run(
  p_run_id      UUID,
  p_lines       JSONB,
  p_vouchers    JSONB,
  p_repayments  JSONB,
  p_totals      JSONB,
  p_ptptn       JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run     payroll_runs%ROWTYPE;
  v_lines   INT := 0;
  v_vouch   INT := 0;
  v_repay   INT := 0;
  v_settled INT := 0;
  v_ptptn   INT := 0;
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

  DELETE FROM payroll_vouchers  WHERE run_id = p_run_id;
  DELETE FROM payroll_lines     WHERE run_id = p_run_id;
  DELETE FROM loan_repayments   WHERE payroll_run_id = p_run_id;
  -- Cleared before reinserting, so finalising twice replaces this run's
  -- deductions rather than meeting the one-per-month constraint head on.
  DELETE FROM ptptn_deductions  WHERE payroll_run_id = p_run_id;

  INSERT INTO payroll_lines (
    run_id, employee_id, employee_name, gross, pcb,
    epf_ee, epf_er, socso_ee, socso_er, eis_ee, eis_er,
    skbbk, epl, ptptn, net, total_lcm, custom_items, adjustments
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
    COALESCE((l ->> 'ptptn')::NUMERIC, 0),
    COALESCE((l ->> 'net')::NUMERIC, 0),
    COALESCE((l ->> 'total_lcm')::NUMERIC, 0),
    COALESCE(l -> 'custom_items', '[]'::JSONB),
    COALESCE(l -> 'adjustments', '[]'::JSONB)
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

  -- balance_after is left null where PTPTN never advised a balance to count
  -- down from. An unknown balance stays unknown rather than being stored as
  -- zero, which would read as "paid off".
  INSERT INTO ptptn_deductions (ptptn_id, payroll_run_id, year, month, amount, balance_after)
  SELECT
    (d ->> 'ptptn_id')::UUID,
    p_run_id,
    (d ->> 'year')::INT,
    (d ->> 'month')::INT,
    COALESCE((d ->> 'amount')::NUMERIC, 0),
    NULLIF(d ->> 'balance_after', '')::NUMERIC
  FROM jsonb_array_elements(COALESCE(p_ptptn, '[]'::JSONB)) AS d
  WHERE COALESCE((d ->> 'amount')::NUMERIC, 0) > 0;
  GET DIAGNOSTICS v_ptptn = ROW_COUNT;

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

  -- No equivalent for PTPTN on purpose: see the note at the top.

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
    'repayments', v_repay, 'loans_settled', v_settled,
    'ptptn', v_ptptn
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finalize_payroll_run(UUID, JSONB, JSONB, JSONB, JSONB, JSONB)
  TO authenticated;

COMMIT;
