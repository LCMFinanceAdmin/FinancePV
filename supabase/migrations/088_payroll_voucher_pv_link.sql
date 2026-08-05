-- 088: Link payroll vouchers to the payment vouchers raised from them.
--
-- A finalized run produces a voucher set (salary + statutory bodies), but those
-- rows lived only inside payroll — there was no actual PV, so nothing went to
-- the GM or the signatories for approval, and Mark Paid recorded a payment that
-- never passed through the approval chain.
--
-- Storing the link both ways round means a run can be reverted: the PVs it
-- raised are cancelled rather than left orphaned, mid-approval, against a run
-- that no longer stands.

ALTER TABLE payroll_vouchers
  ADD COLUMN IF NOT EXISTS pv_id        UUID REFERENCES pvs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pv_no        TEXT,
  ADD COLUMN IF NOT EXISTS pv_status    TEXT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generated_by TEXT;

CREATE INDEX IF NOT EXISTS idx_payroll_vouchers_pv ON payroll_vouchers(pv_id);

-- Records that a finalized run has had its PVs raised, so the button reads
-- correctly after a reload and can't quietly raise a second set.
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS pvs_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pvs_generated_by TEXT,
  ADD COLUMN IF NOT EXISTS reverted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reverted_by      TEXT,
  ADD COLUMN IF NOT EXISTS revert_reason    TEXT;
