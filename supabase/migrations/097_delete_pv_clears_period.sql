-- 097: Deleting a cancelled voucher must free its period too.
--
-- delete_cancelled_pv removed the voucher and released its number, but the
-- recurring_runs entry that recorded "this expense was raised for July" stayed
-- behind — pv_id is ON DELETE SET NULL, so the row survived with the number of
-- a voucher that no longer exists. The expense then refused to be raised again
-- for that period: "July 2026 already has voucher LCM-2026-024", pointing at
-- nothing.
--
-- Deleting a voucher is meant to undo it. That has to include the mark it left
-- on the recurring expense, or the two records disagree and the user is stuck.

CREATE OR REPLACE FUNCTION delete_cancelled_pv(target_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pv_no  TEXT;
  v_status TEXT;
  v_email  TEXT := (auth.jwt() ->> 'email');
  v_role   TEXT;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE email = v_email LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3') THEN
    RAISE EXCEPTION 'Only Finance may delete a cancelled voucher';
  END IF;

  SELECT pv_no, status INTO v_pv_no, v_status FROM pvs WHERE id = target_id;
  IF v_pv_no IS NULL THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;

  -- Only cancelled vouchers. Anything approved or paid is a financial record,
  -- and deleting it would remove evidence of a real decision.
  IF v_status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'Only a cancelled voucher can be deleted (this one is %)', v_status;
  END IF;

  -- Release the number so the series stays unbroken.
  INSERT INTO pv_number_pool (pv_no, prefix, released_by)
  VALUES (v_pv_no, SPLIT_PART(v_pv_no, '-', 1), v_email)
  ON CONFLICT (pv_no) DO NOTHING;

  -- Free the period, so the expense can be raised again for that month.
  -- Matched on the number as well as the id: a row whose pv_id was already
  -- nulled by an earlier delete would otherwise be left blocking forever.
  DELETE FROM recurring_runs WHERE pv_id = target_id OR pv_no = v_pv_no;

  -- And clear the "currently in flight" marker on the expense itself.
  UPDATE recurring_pvs
     SET current_pv_id = NULL, current_pv_no = NULL,
         current_pv_status = NULL, current_period = NULL
   WHERE current_pv_id = target_id OR current_pv_no = v_pv_no;

  DELETE FROM pvs WHERE id = target_id;
  RETURN v_pv_no;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_cancelled_pv(UUID) TO authenticated;

-- Clean up entries already orphaned by a delete made before this fix: the
-- voucher is gone, so the period is not really taken.
DELETE FROM recurring_runs r
 WHERE r.pv_id IS NULL
   AND r.pv_no IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM pvs p WHERE p.pv_no = r.pv_no);

UPDATE recurring_pvs rp
   SET current_pv_id = NULL, current_pv_no = NULL,
       current_pv_status = NULL, current_period = NULL
 WHERE rp.current_pv_no IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM pvs p WHERE p.pv_no = rp.current_pv_no);
