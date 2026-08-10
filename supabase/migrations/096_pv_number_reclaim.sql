-- 096: Deleting a cancelled PV, and reusing its number.
--
-- Numbers were derived from the highest one in use. That has two failure modes
-- once a voucher is deleted: remove one from the middle and the series has a
-- permanent hole an auditor will ask about; remove the latest and the next
-- voucher silently re-uses that number, so two different documents can end up
-- carrying it.
--
-- A freed number is therefore recorded here rather than inferred. Issuing takes
-- the lowest unused entry before falling back to "highest + 1", which keeps the
-- series unbroken, and the ledger leaves a trace of every number that was
-- released and when — the thing plain deletion destroys.

CREATE TABLE IF NOT EXISTS pv_number_pool (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pv_no         TEXT NOT NULL UNIQUE,
  -- LCM / BAM / LSC / HLE — each series is numbered separately.
  prefix        TEXT NOT NULL,
  released_by   TEXT,
  released_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when the number is issued again, so it can never be handed out twice.
  reissued_at   TIMESTAMPTZ,
  reissued_pv_id UUID
);

CREATE INDEX IF NOT EXISTS idx_pv_pool_free ON pv_number_pool(prefix, pv_no) WHERE reissued_at IS NULL;

ALTER TABLE pv_number_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pvpool_read" ON pv_number_pool;
CREATE POLICY "pvpool_read" ON pv_number_pool
  FOR SELECT TO authenticated USING (true);

-- Only Finance may release a number, and only the service role (the edge
-- function that issues numbers) may mark one as reissued.
DROP POLICY IF EXISTS "pvpool_insert" ON pv_number_pool;
CREATE POLICY "pvpool_insert" ON pv_number_pool
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.email = (auth.jwt() ->> 'email')
      AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3')
  ));

GRANT SELECT, INSERT ON pv_number_pool TO authenticated;

-- Delete a cancelled voucher and release its number in one step, so the two
-- can never come apart. SECURITY DEFINER because the caller needs no rights
-- over the pool itself; the role check below is the gate.
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

  -- Only cancelled vouchers. Anything that was approved or paid is a financial
  -- record, and deleting it would remove evidence of a real decision.
  IF v_status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'Only a cancelled voucher can be deleted (this one is %)', v_status;
  END IF;

  INSERT INTO pv_number_pool (pv_no, prefix, released_by)
  VALUES (v_pv_no, SPLIT_PART(v_pv_no, '-', 1), v_email)
  ON CONFLICT (pv_no) DO NOTHING;

  DELETE FROM pvs WHERE id = target_id;
  RETURN v_pv_no;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_cancelled_pv(UUID) TO authenticated;
